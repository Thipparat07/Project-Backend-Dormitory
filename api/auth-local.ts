import express from "express";
import bcrypt from 'bcrypt';
import { conn } from '../db';
import { generateToken, secret } from '../utils/jwtauth';
import { ResultSetHeader, RowDataPacket } from 'mysql2';

export const router = express.Router();

interface User {
  id: number;
  email: string;
  password: string;
  phone: number;
  account_type: string;
}

// สมัครสมาชิก
router.post('/register', async (req, res) => {
  const { email, password, phone, account_type } = req.body;

  if (!email || !password || !phone || !account_type) {
    return res.status(400).json({ message: 'Missing required fields' });
  }


  try {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    const existing = rows as User[];

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const [result] = await conn.query<ResultSetHeader>(
      'INSERT INTO users (email, password, phone, account_type) VALUES (?, ?, ?, ?)',
      [email, hash, phone, account_type]
    );

    res.status(201).json({
      message: 'User registered successfully',
      userId: result.insertId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// ล็อกอิน
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({ message: 'Missing email or password' });
    }

    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
    const users = rows as User[];

    if (users.length === 0) {
      return res.status(401).json({ message: 'User not found' });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: 'Incorrect password' });
    }

    const token = generateToken(
      {
        id: user.id,
        email: user.email,
        role: user.account_type,
      },
      secret
    );

    await conn.query(
      'INSERT INTO auth_logs (user_id, login_method, ip_address, user_agent, success) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'manual', req.ip, req.headers['user-agent'] || '', 1]
    );

    res.json({ token, id: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed' });
  }
});
