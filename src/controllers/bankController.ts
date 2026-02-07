import { Response } from 'express';
import { conn } from '../../db';
import { AuthenticatedRequest } from '../models/request';
import { RowDataPacket } from 'mysql2';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';

export const addBank = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;

        if (!user || user.role !== 'owner') {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.BANK.ONLY_OWNER));
        }

        const { dormitory_id, bank_name, account_number, account_name } = req.body;

        // ตรวจสอบข้อมูล
        if (!dormitory_id || !bank_name || !account_number || !account_name) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.BANK.MISSING_FIELDS));
        }

        // ตรวจสอบว่า dormitory_id เป็นของ owner คนนี้จริงไหม
        const [dormitories] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitory_id, user.id]
        );

        if (dormitories.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.BANK.UNAUTHORIZED_DORM));
        }

        // เพิ่มข้อมูลบัญชีธนาคาร
        await conn.execute(
            `INSERT INTO dormitory_banks (dormitory_id, bank_name, account_number, account_name)
       VALUES (?, ?, ?, ?)`,
            [dormitory_id, bank_name, account_number, account_name]
        );

        res.status(201).json(ResponseTemplate.success(RES_MESSAGES.BANK.ADD_SUCCESS));

    } catch (error) {
        console.error('Add bank error:', error);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.BANK.INTERNAL_ERROR));
    }
};
