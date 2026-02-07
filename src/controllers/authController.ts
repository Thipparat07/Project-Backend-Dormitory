import { NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { conn } from '../../db';
import { generateToken, verifyGoogleTempToken } from '../utils/jwtauth';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import passport from 'passport';

type Role = 'OWNER' | 'TENANT';

interface UserRow {
    id: number;
    email: string;
    password: string;
    phone: string;
    account_type: Role;
}

export const register = async (req: any, res: any) => {
    const { email, password, phone, account_type } = req.body;

    if (!email || !password || !phone || !account_type) {
        return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.AUTH.MISSING_FIELDS));
    }

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (rows.length > 0) {
            return res.status(409).json(ResponseTemplate.error(RES_MESSAGES.AUTH.EMAIL_EXISTS));
        }

        const hash = await bcrypt.hash(password, 10);

        const [result] = await conn.query<ResultSetHeader>(
            'INSERT INTO users (email, password, phone, account_type) VALUES (?, ?, ?, ?)',
            [email, hash, phone, account_type]
        );

        res.status(201).json(ResponseTemplate.success(RES_MESSAGES.AUTH.REGISTER_SUCCESS, {
            userId: result.insertId,
        }));
    } catch (err) {
        console.error(err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.AUTH.REGISTER_FAILED));
    }
};

export const login = async (req: any, res: any) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.AUTH.MISSING_EMAIL_PASSWORD));
    }

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (rows.length === 0) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.USER_NOT_FOUND));
        }

        const user = rows[0] as UserRow;

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INCORRECT_PASSWORD));
        }

        // ✅ Access Token (มาตรฐานเดียวทั้งระบบ)
        const token = generateToken({
            id: user.id,
            role: user.account_type,
        });

        res.json(ResponseTemplate.success(RES_MESSAGES.AUTH.LOGIN_SUCCESS, {
            token,
            user: {
                id: user.id,
                role: user.account_type,
            },
        }));

    } catch (err) {
        console.error(err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.AUTH.LOGIN_FAILED));
    }
};

// Google Auth Callback Logic
export const googleCallback = (req, res, next) => {
    passport.authenticate("google", { session: false }, (err: any, user: any, info: any) => {
        if (err) return next(err);

        // login สำเร็จ
        if (user) {
            const accessToken = generateToken({
                id: user.id,
                role: user.account_type,
            });

            return res.redirect(
                `http://localhost:4200/login?token=${accessToken}`
            );
        }

        // ต้องเลือก role
        if (info?.message === 'need-select-role') {
            const tempToken = (info as any).token;
            return res.redirect(
                `http://localhost:4200/select-role?token=${tempToken}`
            );
        }

        // email ซ้ำ ต้อง confirm
        if (info?.message === 'email-exists') {
            const tempToken = (info as any).token;
            return res.redirect(
                `http://localhost:4200/confirm-link?token=${tempToken}`
            );
        }

        return res.redirect('/login?error=unauthorized');
    })(req, res, next);
};

export const googleCompleteRegistration = async (req, res) => {
    try {
        const { token, account_type } = req.body;

        const decoded = verifyGoogleTempToken(token) as any;
        const { google_id, email, name, photo } = decoded;

        const [rows] = await conn.execute(
            'SELECT * FROM users WHERE google_id = ? OR email = ?',
            [google_id, email]
        );

        if ((rows as any).length > 0) {
            return res.status(409).json(ResponseTemplate.error(RES_MESSAGES.AUTH.USER_EXISTS));
        }

        const [result] = await conn.execute(
            `INSERT INTO users (email, full_name, google_id, profile_picture, account_type)
       VALUES (?, ?, ?, ?, ?)`,
            [email, name, google_id, photo, account_type]
        );

        const accessToken = generateToken({
            id: (result as any).insertId,
            role: account_type,
        });

        res.json(ResponseTemplate.success(RES_MESSAGES.AUTH.REGISTRATION_COMPLETE, { token: accessToken }));

    } catch (err) {
        res.status(400).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
    }
};

export const googleLinkConfirm = async (req, res) => {
    try {
        const { token } = req.body;
        const decoded = verifyGoogleTempToken(token) as any;

        const { email, google_id, name, photo } = decoded;

        const [rows] = await conn.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if ((rows as any).length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.AUTH.USER_NOT_FOUND));
        }

        await conn.execute(
            'UPDATE users SET google_id=?, full_name=?, profile_picture=? WHERE email=?',
            [google_id, name, photo, email]
        );

        const user = (rows as any)[0];

        const accessToken = generateToken({
            id: user.id,
            role: user.account_type,
        });

        res.json(ResponseTemplate.success(RES_MESSAGES.AUTH.ACCOUNT_LINKED, { token: accessToken }));

    } catch {
        res.status(400).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
    }
};
