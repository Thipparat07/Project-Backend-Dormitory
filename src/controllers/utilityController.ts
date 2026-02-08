import { Response } from 'express';
import { conn } from '../../db';
import { RowDataPacket } from 'mysql2';
import { AuthenticatedRequest } from '../models/request';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';

export const createOrUpdateUtility = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { water_rate, electricity_rate } = req.body;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        if (water_rate === undefined || electricity_rate === undefined) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // Verify dormitory ownership
        const [dormitories] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitoryId, user.id]
        );

        if (dormitories.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // Check if utility settings exist
        const [existing] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM room_utilities WHERE dormitory_id = ?',
            [dormitoryId]
        );

        if (existing.length === 0) {
            // Create new
            await conn.execute(
                'INSERT INTO room_utilities (dormitory_id, water_rate, electricity_rate) VALUES (?, ?, ?)',
                [dormitoryId, water_rate, electricity_rate]
            );
        } else {
            // Update existing
            await conn.execute(
                'UPDATE room_utilities SET water_rate = ?, electricity_rate = ? WHERE dormitory_id = ?',
                [water_rate, electricity_rate, dormitoryId]
            );
        }

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.UTILITY.UPDATE_SUCCESS));

    } catch (err) {
        console.error('Create/Update utility error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const getUtility = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Verify dormitory ownership
        const [dormitories] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitoryId, user.id]
        );

        if (dormitories.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        const [utilities] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM room_utilities WHERE dormitory_id = ?',
            [dormitoryId]
        );

        if (utilities.length === 0) {
            // Return default values if not set
            return res.status(200).json(ResponseTemplate.success(RES_MESSAGES.UTILITY.GET_SUCCESS, {
                dormitory_id: dormitoryId,
                water_rate: 0,
                electricity_rate: 0
            }));
        }

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.UTILITY.GET_SUCCESS, utilities[0]));

    } catch (err) {
        console.error('Get utility error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};
