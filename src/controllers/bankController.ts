import { Response } from 'express';
import { conn } from '../../db';
import { RowDataPacket } from 'mysql2';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';

export const Banks = async (req, res) => {
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

export const getAllBanks = async (req, res) => {
    try {
        const user = req.auth;
        if (!user || user.role !== 'owner') {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.BANK.ONLY_OWNER));
        }

        // Fetch all banks associated with dormitories owned by the user
        const [banks] = await conn.query<RowDataPacket[]>(
            `SELECT db.*, d.name as dormitory_name 
             FROM dormitory_banks db
             JOIN dormitories d ON db.dormitory_id = d.id
             WHERE d.owner_id = ?`,
            [user.id]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.BANK.GET_ALL_BANKS_SUCCESS, banks));
    } catch (error) {
        console.error('Get all banks error:', error);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.BANK.INTERNAL_ERROR));
    }
};

export const updateBank = async (req, res) => {
    try {
        const user = req.auth;
        const bankId = req.params.id;
        const { bank_name, account_number, account_name } = req.body;

        if (!user || user.role !== 'owner') {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.BANK.ONLY_OWNER));
        }

        // Verify ownership: Join with dormitories to check owner_id
        const [banks] = await conn.query<RowDataPacket[]>(
            `SELECT db.id 
             FROM dormitory_banks db
             JOIN dormitories d ON db.dormitory_id = d.id
             WHERE db.id = ? AND d.owner_id = ?`,
            [bankId, user.id]
        );

        if (banks.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.BANK.NOT_FOUND)); // Or UNAUTHORIZED_ACTION if it exists but not owned
        }

        await conn.execute(
            `UPDATE dormitory_banks 
             SET bank_name = COALESCE(?, bank_name), 
                 account_number = COALESCE(?, account_number), 
                 account_name = COALESCE(?, account_name)
             WHERE id = ?`,
            [bank_name, account_number, account_name, bankId]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.BANK.UPDATE_SUCCESS));

    } catch (error) {
        console.error('Update bank error:', error);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.BANK.INTERNAL_ERROR));
    }
};

export const deleteBank = async (req, res) => {
    try {
        const user = req.auth;
        const bankId = req.params.id;

        if (!user || user.role !== 'owner') {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.BANK.ONLY_OWNER));
        }

        // Verify ownership
        const [banks] = await conn.query<RowDataPacket[]>(
            `SELECT db.id 
             FROM dormitory_banks db
             JOIN dormitories d ON db.dormitory_id = d.id
             WHERE db.id = ? AND d.owner_id = ?`,
            [bankId, user.id]
        );

        if (banks.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.BANK.NOT_FOUND));
        }

        await conn.execute('DELETE FROM dormitory_banks WHERE id = ?', [bankId]);

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.BANK.DELETE_SUCCESS));

    } catch (error) {
        console.error('Delete bank error:', error);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.BANK.INTERNAL_ERROR));
    }
};
