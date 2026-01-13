import express from "express";
import passport from "passport";
import { generateToken, secret, verifyToken } from "../utils/jwtauth";
import { conn } from "../db";

export const router = express.Router();

router.get("/google",
    passport.authenticate("google", {
        scope: ["profile", "email"],
        session: false
    })
);

router.get("/google/callback", (req, res, next) => {
    passport.authenticate("google", { session: false }, (err, user, info) => {
        if (err) return next(err);

        if (user) {
            // login สำเร็จ มี user ใน DB
            const accessToken = generateToken({
                id: user.id,
                email: user.email,
                role: user.account_type,
            }, secret);
            return res.redirect(`http://frontend.dormmy.online/login?token=${accessToken}`);
        } else if (info && info.message === 'need-select-role') {
            // ยังไม่มี user ต้องไปหน้าเลือก role พร้อม token ชั่วคราว
            return res.redirect(`http://frontend.dormmy.online/select-role?token=${info.token}`);
        } else if (info && info.message === 'email-exists') {
            // email นี้มีอยู่แล้ว → ขอผู้ใช้ยืนยันก่อน
            return res.redirect(`http://frontend.dormmy.online/confirm-link?token=${info.token}`);
        } else {
            return res.redirect('/login?error=unauthorized');
        }
    })(req, res, next);
});

router.post('/google/complete-registration', async (req, res) => {
    try {
        const { token, account_type } = req.body;
        const decoded = verifyToken(token, secret);

        if (!decoded || !decoded.valid) {
            return res.status(400).json({ message: 'Invalid token' });
        }

        const { google_id, email, name, photo } = decoded.decoded as any;

        if (!google_id || !email) {
            return res.status(400).json({ message: 'Missing Google profile data' });
        }

        // 1. เช็ค google_id ก่อน
        const [rowsByGoogleId] = await conn.execute('SELECT * FROM users WHERE google_id = ?', [google_id]);
        if ((rowsByGoogleId as any).length > 0) {
            return res.status(409).json({ message: 'User already exists with Google' });
        }

        // 2. ถ้ายังไม่มี google_id → เช็คจาก email
        const [rowsByEmail] = await conn.execute('SELECT * FROM users WHERE email = ?', [email]);
        if ((rowsByEmail as any).length > 0) {
            // มี email นี้แล้ว → ให้ผูก google_id กับบัญชีเดิมแทน
            await conn.execute(
                'UPDATE users SET google_id = ?, full_name = ?, profile_picture = ? WHERE email = ?',
                [google_id, name, photo, email]
            );

            const existingUser = (rowsByEmail as any)[0];

            const newToken = generateToken({
                id: existingUser.id,
                email: existingUser.email,
                role: existingUser.account_type,
            }, secret);

            return res.json({ message: 'Google account linked to existing email', token: newToken });
        }

        // 3. ยังไม่เคยมี email นี้เลย → สร้างใหม่
        const [result] = await conn.execute(
            `INSERT INTO users (email, full_name, google_id, profile_picture, account_type)
       VALUES (?, ?, ?, ?, ?)`,
            [email, name, google_id, photo, account_type]
        );

        // result มี insertId
        const newUser = {
            id: (result as any).insertId,
            email,
            role: account_type,
        };

        const newToken = generateToken(newUser, secret);

        res.json({ message: 'Registration completed', token: newToken });

    } catch (err: any) {
        console.error('Registration error:', err);
        res.status(500).json({ message: 'Registration error', error: err.message });
    }
});

router.post('/google/link-confirm', async (req, res) => {
    try {
        const { token } = req.body;
        const decoded = verifyToken(token, secret);

        if (!decoded || !decoded.valid) {
            return res.status(400).json({ message: 'Invalid token' });
        }

        const { email, google_id, name, photo } = decoded.decoded as any;

        const [rows] = await conn.execute('SELECT * FROM users WHERE email = ?', [email]);
        if ((rows as any).length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        await conn.execute(
            'UPDATE users SET google_id = ?, full_name = ?, profile_picture = ? WHERE email = ?',
            [google_id, name, photo, email]
        );

        const user = (rows as any)[0];

        const newToken = generateToken({ id: user.id, email: user.email, role: user.account_type }, secret);
        res.json({ message: 'Google linked successfully', token: newToken });

    } catch (err: any) {
        console.error(err);
        res.status(500).json({ message: 'Linking error', error: err.message });
    }
});
