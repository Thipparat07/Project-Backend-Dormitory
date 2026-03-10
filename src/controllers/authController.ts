import { NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { conn } from '../../db';
import { generateToken, verifyGoogleTempToken } from '../utils/jwtauth';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import passport from 'passport';

import { ContextRoles } from '../models/auth';

interface UserRow {
    id: number;
    email: string;
    password: string;
    phone: string;
}

export const getUserContexts = async (userId: number): Promise<ContextRoles> => {

    const [ownerRows] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM dormitories WHERE owner_id = ?',
        [userId]
    );

    const [tenantRows] = await conn.query<RowDataPacket[]>(
        `SELECT dormitory_id 
   FROM tenants 
   WHERE user_id = ? 
   AND join_status = 'approved'`,
        [userId]
    );

    const contexts: ContextRoles = {};

    // owner
    ownerRows.forEach((row: any) => {
        contexts[row.id] = 'owner';
    });

    // tenant (don't override owner)
    tenantRows.forEach((row: any) => {
        if (!contexts[row.dormitory_id]) {
            contexts[row.dormitory_id] = 'tenant';
        }
    });

    return contexts;
};

export const register = async (req, res) => {
    const { email, password, phone } = req.body;

    if (!email || !password || !phone) {
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
            'INSERT INTO users (email, password, phone) VALUES (?, ?, ?)',
            [email, hash, phone]
        );

        res.status(201).json(ResponseTemplate.success(RES_MESSAGES.AUTH.REGISTER_SUCCESS, {
            userId: result.insertId,
        }));
    } catch (err) {
        console.error(err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.AUTH.REGISTER_FAILED));
    }
};

export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.AUTH.MISSING_EMAIL_PASSWORD));
    }

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            'SELECT id, email, password FROM users WHERE email = ?',
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

        const contexts = await getUserContexts(user.id);

        // Access Token
        const token = generateToken({
            id: user.id,
            contexts: contexts,
        });

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        res.json(ResponseTemplate.success(RES_MESSAGES.AUTH.LOGIN_SUCCESS, {
            user: {
                id: user.id,
                contexts: contexts,
            },
        }));

    } catch (err) {
        console.error(err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.AUTH.LOGIN_FAILED));
    }
};

// Google Auth Callback Logic
export const googleCallback = (req, res) => {
    const user = req.user;
    const info = req.authInfo;

    if (user) {
        (async () => {
            const contexts = await getUserContexts(user.id);
            const accessToken = generateToken({
                id: user.id,
                contexts: contexts,
            });

            res.cookie('token', accessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
                maxAge: 24 * 60 * 60 * 1000 // 1 day
            });

            return res.redirect(
                `${process.env.FRONTEND_URL}/auth/success`
            );
        })();
        return;
    }



    if (info?.message === 'email-exists') {
        return res.redirect(
            (`${process.env.FRONTEND_URL}/auth/confirm?token=${info.token}`)
        );
    }

    return res.redirect(`${process.env.FRONTEND_URL}/login?error=unauthorized`);
};




export const googleLinkConfirm = async (req, res) => {
    try {
        const { token } = req.body;

        const verifyResult = verifyGoogleTempToken(token) as any;

        if (!verifyResult.valid) {
            return res.status(400).json(
                ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN)
            );
        }

        const { email, google_id, name, photo } = verifyResult.decoded;

        // หา user
        const [rows] = await conn.execute(
            'SELECT id, google_id FROM users WHERE email = ?',
            [email]
        );

        if ((rows as any).length === 0) {
            return res.status(404).json(
                ResponseTemplate.error(RES_MESSAGES.AUTH.USER_NOT_FOUND)
            );
        }

        const user = (rows as any)[0];

        // ป้องกัน link ซ้ำ
        if (user.google_id) {
            return res.status(409).json(
                ResponseTemplate.error(RES_MESSAGES.AUTH.GOOGLE_ALREADY_LINKED)
            );
        }

        // ป้องกัน google_id ชน
        const [googleCheck] = await conn.execute(
            'SELECT id FROM users WHERE google_id = ?',
            [google_id]
        );

        if ((googleCheck as any).length > 0) {
            return res.status(409).json(
                ResponseTemplate.error(RES_MESSAGES.AUTH.GOOGLE_ALREADY_LINKED)
            );
        }

        // update
        await conn.execute(
            'UPDATE users SET google_id=?, full_name=?, profile_picture=? WHERE email=?',
            [google_id, name, photo, email]
        );

        const contexts = await getUserContexts(user.id);

        // generate token
        const accessToken = generateToken({
            id: user.id,
            contexts: contexts,
        });

        res.cookie('token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        });

        res.json(
            ResponseTemplate.success(
                RES_MESSAGES.AUTH.ACCOUNT_LINKED,
                {
                    user: {
                        id: user.id,
                        contexts: contexts,
                    },
                }
            )
        );

    } catch (err) {
        res.status(400).json(
            ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN)
        );
    }
};

export const logout = (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    });
    res.json(ResponseTemplate.success({ th: 'ออกจากระบบสำเร็จ', en: 'Logout successful' }));
};

export const getMe = async (req, res) => {
    try {
        const user = req.auth;
        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        const contexts = await getUserContexts(user.id);

        // ดึงข้อมูลพื้นฐานเพิ่ม (เช่น อีเมล ชื่อ รูปภาพ)
        const [rows] = await conn.execute(
            'SELECT id, email, full_name, profile_picture FROM users WHERE id = ?',
            [user.id]
        );

        if ((rows as any).length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.AUTH.USER_NOT_FOUND));
        }

        const userData = (rows as any)[0];

        res.json(ResponseTemplate.success({ th: 'ดึงข้อมูลสำเร็จ', en: 'Get Me Success' }, {
            user: {
                ...userData,
                contexts: contexts
            }
        }));

    } catch (err) {
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.GLOBAL.INTERNAL_SERVER_ERROR));
    }
};
