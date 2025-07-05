import express from 'express';
import { conn } from '../db';
import { RowDataPacket } from 'mysql2';
import { jwtAuthen } from '../utils/jwtauth';
import { AuthenticatedRequest } from '../models/request';

export const router = express.Router();

// interface AuthenticatedRequest extends Request {
//   auth?: {
//     id: number;
//     role: string;
//   };
// }

function generateJoinCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

router.post('/', jwtAuthen, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.auth;

    if (!user || user.role !== 'owner') {
      return res.status(403).json({ message: 'Access denied. Only owners can create dormitories.' });
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
      return res.status(400).json({ message: 'Missing required fields' });
    }



    // ยืนยันว่าผู้ใช้มีอยู่ในฐานข้อมูล
    const [users] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE id = ? AND account_type = "owner"',
      [ownerId]
    );
    if (users.length === 0) {
      return res.status(403).json({ message: 'Owner not found' });
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

    // สร้างหอพักพร้อม join_code
    const [result] = await conn.execute(
      `INSERT INTO dormitories 
    (owner_id, name, phone, address, bill_generation_day, bill_due_date, billing_type, bill_delivery_mode, join_code)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ownerId, name, phone, address, bill_generation_day, bill_due_date, billing_type, bill_delivery_mode, joinCode]
    );
    const dormitoryId = (result as any).insertId;


    // สร้างชั้นและห้อง (ถ้ามี)
    for (let i = 1; i <= number_of_floors; i++) {
      const [floorResult] = await conn.execute(
        'INSERT INTO floors (dormitory_id, floor_number) VALUES (?, ?)',
        [dormitoryId, i]
      );
      const floorId = (floorResult as any).insertId;

      for (let j = 1; j <= rooms_per_floor; j++) {
        //ตั้งชื่อห้องเป็น Fชั้น-Rห้อง (เช่น F2-R3)
        const roomNumber = `F${i}-R${j}`;
        await conn.execute(
          'INSERT INTO rooms (floor_id, room_number, room_type, room_rate) VALUES (?, ?, ?, ?)',
          [floorId, roomNumber, null, null]
        );
      }
    }

    res.status(200).json({
      message: 'Dormitory created successfully',
      dormitory_id: dormitoryId,
      join_code: joinCode,  // ส่ง join_code กลับไปให้เจ้าของหอ
    });

  } catch (err) {
    console.error('Create dormitory error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});