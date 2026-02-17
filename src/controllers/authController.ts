import { NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { conn } from '../../db';
import { generateToken, verifyGoogleTempToken } from '../utils/jwtauth';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import passport from 'passport';

import { UserRole } from '../models/auth';

interface UserRow {
    id: number;
    email: string;
    password: string;
    phone: string;
    account_type: UserRole;
}

export const register = async (req, res) => {
    const { email, password, phone, account_type } = req.body;

    if (!['owner', 'tenant'].includes(account_type)) {
        return res.status(400).json(
            ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_ROLE)
        );
    }

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

export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.AUTH.MISSING_EMAIL_PASSWORD));
    }

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            'SELECT id, email, password, account_type FROM users WHERE email = ?',
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

        //Access Token (มาตรฐานเดียวทั้งระบบ)
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
export const googleCallback = (req, res) => {
    const user = req.user;
    const info = req.authInfo;

    if (user) {
        const accessToken = generateToken({
            id: user.id,
            role: user.account_type,
        });

        return res.redirect(
            `${process.env.FRONTEND_URL}/login?token=${accessToken}`
        );
    }

    if (info?.message === 'need-select-role') {
        return res.redirect(
            `${process.env.FRONTEND_URL}/select-role?token=${info.token}`
        );
    }

    if (info?.message === 'email-exists') {
        return res.redirect(
            `${process.env.FRONTEND_URL}/confirm-link?token=${info.token}`
        );
    }

    return res.redirect(`${process.env.FRONTEND_URL}/login?error=unauthorized`);
};


export const googleCompleteRegistration = async (req, res) => {
    try {
        const { token, account_type } = req.body;

        const verifyResult = verifyGoogleTempToken(token) as any;
        if (!verifyResult.valid) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        const { google_id, email, name, photo } = verifyResult.decoded;

        const [rows] = await conn.execute(
            'SELECT google_id, email FROM users WHERE google_id = ? OR email = ?',
            [google_id, email]
        );

        if ((rows as any).length > 0) {
            return res.status(409).json(ResponseTemplate.error(RES_MESSAGES.AUTH.USER_EXISTS));
        }

        if (!['owner', 'tenant'].includes(account_type)) {
            return res.status(400).json(
                ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_ROLE)
            );
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

        res.json(ResponseTemplate.success(RES_MESSAGES.AUTH.REGISTRATION_COMPLETE, {
            token: accessToken,
            user: {
                id: (result as any).insertId,
                role: account_type as UserRole,
            },
        }));

    } catch (err) {
        console.error("Google Registration Error:", err);
        res.status(400).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
    }
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
            'SELECT id, account_type, google_id FROM users WHERE email = ?',
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

        // generate token
        const accessToken = generateToken({
            id: user.id,
            role: user.account_type,
        });

        res.json(
            ResponseTemplate.success(
                RES_MESSAGES.AUTH.ACCOUNT_LINKED,
                {
                    token: accessToken,
                    user: {
                        id: user.id,
                        role: user.account_type,
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
