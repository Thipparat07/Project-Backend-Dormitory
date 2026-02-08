import { Response } from 'express';
import { conn } from '../../db';
import { RowDataPacket } from 'mysql2';
import { AuthenticatedRequest } from '../models/request';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';

function generateJoinCode(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export const createDormitory = async (req, res) => {
    try {
        const user = req.auth;

        if (!user || user.role !== 'owner') {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        const ownerId = user.id;

        const {
            name,
            phone,
            address,
            bill_generation_day,
            bill_due_date,
            billing_type,
            bill_delivery_mode,
            number_of_floors = 0,
            rooms_per_floor = 0,
        } = req.body;

        if (!name || !phone || !address || !bill_generation_day || !bill_due_date || !billing_type) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // ยืนยันว่าผู้ใช้มีอยู่ในฐานข้อมูล
        const [users] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM users WHERE id = ? AND account_type = "owner"',
            [ownerId]
        );
        if (users.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.OWNER_NOT_FOUND));
        }

        // สร้าง join_code ที่ unique
        let joinCode = generateJoinCode();
        let isDuplicate = true;
        while (isDuplicate) {
            const [rows] = await conn.query<RowDataPacket[]>(
                'SELECT id FROM dormitories WHERE join_code = ?',
                [joinCode]
            );
            if (rows.length === 0) {
                isDuplicate = false;
            } else {
                joinCode = generateJoinCode();
            }
        }

        // Validate bill_delivery_mode (ENUM: 'auto', 'manual')
        const validDeliveryModes = ['auto', 'manual'];
        const deliveryMode = validDeliveryModes.includes(bill_delivery_mode) ? bill_delivery_mode : 'manual';

        // สร้างหอพักพร้อม join_code
        const [result] = await conn.execute(
            `INSERT INTO dormitories 
    (owner_id, name, phone, address, bill_generation_day, bill_due_date, billing_type, bill_delivery_mode, join_code)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [ownerId, name, phone, address, bill_generation_day, bill_due_date, billing_type, deliveryMode, joinCode]
        );
        const dormitoryId = (result as any).insertId;


        // สร้างห้องพัก (เก็บ floor_number ไว้ในตาราง rooms โดยตรง)
        for (let i = 1; i <= number_of_floors; i++) {
            for (let j = 1; j <= rooms_per_floor; j++) {
                // ตั้งชื่อห้องเป็น Fชั้น-Rห้อง (เช่น F2-R3)
                const roomNumber = `F${i}-R${j}`;

                // ตรวจสอบว่ามี column dormitory_id หรือไม่ (หรือควรแก้ Database ให้มี)
                // ตาม Schema ล่าสุด: rooms (id, floor_number, room_number, room_type_id, furniture_fee)
                // **จำเป็นต้องเพิ่ม dormitory_id** ไม่งั้นจะไม่รู้ว่าห้องนี้ของหอไหน

                await conn.execute(
                    `INSERT INTO rooms (dormitory_id, floor_number, room_number) VALUES (?, ?, ?)`,
                    [dormitoryId, i, roomNumber]
                );
            }
        }

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.DORMITORY.CREATE_SUCCESS, {
            dormitory_id: dormitoryId,
            join_code: joinCode,
        }));

    } catch (err) {
        console.error('Create dormitory error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const getDormitoryRooms = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Verify dormitory ownership
        const [dormitories] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitoryId, user.id]
        );

        if (dormitories.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // Fetch rooms
        const [rooms] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM rooms WHERE dormitory_id = ? ORDER BY floor_number, room_number',
            [dormitoryId]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.ROOM.GET_SUCCESS, rooms));

    } catch (err) {
        console.error('Get dormitory rooms error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const updateRoomRent = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { room_ids, room_price } = req.body;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        if (!room_ids || !Array.isArray(room_ids) || room_ids.length === 0 || !room_price) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // Verify dormitory ownership
        const [dormitories] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitoryId, user.id]
        );

        if (dormitories.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // Verify all rooms belong to this dormitory
        // We can do this by checking if the count of rooms in DB matches the input array length
        const placeholders = room_ids.map(() => '?').join(',');
        const [validRooms] = await conn.query<RowDataPacket[]>(
            `SELECT id FROM rooms WHERE dormitory_id = ? AND id IN (${placeholders})`,
            [dormitoryId, ...room_ids]
        );

        if (validRooms.length !== room_ids.length) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.ROOM.UNAUTHORIZED));
        }

        // Update rooms
        await conn.execute(
            `UPDATE rooms SET room_price = ? WHERE id IN (${placeholders})`,
            [room_price, ...room_ids]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.ROOM.UPDATE_SUCCESS));

    } catch (err) {
        console.error('Update room rent error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const assignRoomType = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { room_ids, room_type_id } = req.body;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        if (!room_ids || !Array.isArray(room_ids) || room_ids.length === 0 || !room_type_id) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // Verify dormitory ownership
        const [dormitories] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitoryId, user.id]
        );

        if (dormitories.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // Verify room type exists and belongs to dormitory
        const [roomTypes] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM room_types WHERE id = ? AND dormitory_id = ?',
            [room_type_id, dormitoryId]
        );

        if (roomTypes.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.ROOM_TYPE.NOT_FOUND));
        }

        const roomTypePrice = roomTypes[0].price;

        // Verify all rooms belong to this dormitory
        const placeholders = room_ids.map(() => '?').join(',');
        const [validRooms] = await conn.query<RowDataPacket[]>(
            `SELECT id FROM rooms WHERE dormitory_id = ? AND id IN (${placeholders})`,
            [dormitoryId, ...room_ids]
        );

        if (validRooms.length !== room_ids.length) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.ROOM.UNAUTHORIZED));
        }

        // Update rooms
        await conn.execute(
            `UPDATE rooms SET room_type_id = ? WHERE id IN (${placeholders})`,
            [room_type_id, ...room_ids]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.ROOM_TYPE.ASSIGN_SUCCESS));

    } catch (err) {
        console.error('Assign room type error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};
