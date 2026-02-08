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
