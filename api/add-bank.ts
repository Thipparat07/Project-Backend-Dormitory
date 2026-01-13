// api/add-bank.ts
import express from 'express';
import { conn } from '../db';
import { jwtAuthen } from '../utils/jwtauth';
import { AuthenticatedRequest } from '../models/request';
import { RowDataPacket } from 'mysql2';

export const router = express.Router();

router.post('/', jwtAuthen, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.auth;

    if (!user || user.role !== 'owner') {
      return res.status(403).json({ message: 'Only owners can add bank accounts.' });
    }

    const { dormitory_id, bank_name, account_number, account_name } = req.body;

    // ตรวจสอบข้อมูล
    if (!dormitory_id || !bank_name || !account_number || !account_name) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // ตรวจสอบว่า dormitory_id เป็นของ owner คนนี้จริงไหม
    const [dormitories] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM dormitories WHERE id = ? AND owner_id = ?',
      [dormitory_id, user.id]
    );

    if (dormitories.length === 0) {
      return res.status(403).json({ message: 'Unauthorized to modify this dormitory.' });
    }

    // เพิ่มข้อมูลบัญชีธนาคาร
    await conn.execute(
      `INSERT INTO dormitory_banks (dormitory_id, bank_name, account_number, account_name)
       VALUES (?, ?, ?, ?)`,
      [dormitory_id, bank_name, account_number, account_name]
    );

    res.status(201).json({ message: 'Bank account added successfully.' });

  } catch (error) {
    console.error('Add bank error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
