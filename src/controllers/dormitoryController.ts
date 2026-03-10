import { Response } from 'express';
import { conn } from '../../db';
import { RowDataPacket } from 'mysql2';
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

export const getOwnerDormitories = async (req, res) => {
    try {
        const user = req.auth;
        const ownerId = user.id;

        const [dormitories] = await conn.query<RowDataPacket[]>(
            `SELECT d.*, 
            (SELECT COUNT(id) FROM rooms r WHERE r.dormitory_id = d.id) as total_rooms, 
            (SELECT COUNT(id) FROM tenants t WHERE t.dormitory_id = d.id AND t.join_status = "approved") as occupied_rooms,
            ((SELECT COUNT(id) FROM rooms r WHERE r.dormitory_id = d.id) - (SELECT COUNT(id) FROM tenants t WHERE t.dormitory_id = d.id AND t.join_status = "approved")) as vacant_rooms,
            (SELECT COUNT(DISTINCT b.room_id) FROM bills b JOIN rooms r ON b.room_id = r.id WHERE r.dormitory_id = d.id AND b.status = 'unpaid') as overdue_rooms
            FROM dormitories d WHERE d.owner_id = ? ORDER BY d.created_at DESC`,
            [ownerId]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.DORMITORY.GET_SUCCESS, dormitories));

    } catch (err) {
        console.error('Get owner dormitories error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const createDormitory = async (req, res) => {
    try {
        const user = req.auth;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
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
            'SELECT * FROM users WHERE id = ?',
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


        // แปลงค่าให้เป็น Number อย่างชัดเจน
        const totalFloors = Number(number_of_floors) || 0;
        const totalRoomsPerFloor = Number(rooms_per_floor) || 0;

        // สร้างห้องพัก (เก็บ floor_number ไว้ในตาราง rooms โดยตรง)
        for (let i = 1; i <= totalFloors; i++) {
            for (let j = 1; j <= totalRoomsPerFloor; j++) {
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
        const dormitoryId = req.params.id;

        // Fetch rooms with their join status
        const [rooms] = await conn.query<RowDataPacket[]>(
            `SELECT r.*, rt.name as room_type_name, rt.price,
            (SELECT t.join_status FROM tenants t 
             WHERE t.room_id = r.id AND t.join_status IN ('approved', 'pending') 
             ORDER BY FIELD(t.join_status, 'approved', 'pending') LIMIT 1) as join_status
             FROM rooms r 
             LEFT JOIN room_types rt ON r.room_type_id = rt.id
             WHERE r.dormitory_id = ? 
             ORDER BY r.floor_number ASC, r.room_number ASC`,
            [dormitoryId]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.ROOM.GET_SUCCESS, rooms));

    } catch (err) {
        console.error('Get dormitory rooms error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const updateFurnitureFee = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { room_ids, furniture_fee } = req.body;

        if (!user || !user.contexts || user.contexts[String(dormitoryId)] !== 'owner') {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        if (!room_ids || !Array.isArray(room_ids) || room_ids.length === 0 || furniture_fee === undefined) {
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
            `UPDATE rooms SET furniture_fee = ? WHERE id IN (${placeholders})`,
            [furniture_fee, ...room_ids]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.ROOM.UPDATE_SUCCESS));

    } catch (err) {
        console.error('Update furniture fee error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const assignRoomType = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { room_ids, room_type_id } = req.body;

        if (!user || !user.contexts || user.contexts[String(dormitoryId)] !== 'owner') {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
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
