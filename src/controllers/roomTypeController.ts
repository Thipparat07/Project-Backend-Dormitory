import { Response } from 'express';
import { conn } from '../../db';
import { RowDataPacket } from 'mysql2';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';

export const createRoomType = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { name, price } = req.body;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        if (!name || price === undefined) {
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

        await conn.execute(
            `INSERT INTO room_types (dormitory_id, name, price) VALUES (?, ?, ?)`,
            [dormitoryId, name, price]
        );

        res.status(201).json(ResponseTemplate.success(RES_MESSAGES.ROOM_TYPE.CREATE_SUCCESS));

    } catch (err) {
        console.error('Create room type error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const getRoomTypes = async (req, res) => {
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

        const [roomTypes] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM room_types WHERE dormitory_id = ?',
            [dormitoryId]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.ROOM_TYPE.GET_SUCCESS, roomTypes));

    } catch (err) {
        console.error('Get room types error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const updateRoomType = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id; // Verify ownership via dorm
        const roomTypeId = req.params.typeId;
        const { name, price } = req.body;

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

        // Verify room type belongs to dormitory
        const [types] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM room_types WHERE id = ? AND dormitory_id = ?',
            [roomTypeId, dormitoryId]
        );

        if (types.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.ROOM_TYPE.NOT_FOUND));
        }

        await conn.execute(
            'UPDATE room_types SET name = COALESCE(?, name), price = COALESCE(?, price) WHERE id = ?',
            [name, price, roomTypeId]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.ROOM_TYPE.UPDATE_SUCCESS));

    } catch (err) {
        console.error('Update room type error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

export const deleteRoomType = async (req, res) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const roomTypeId = req.params.typeId;

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

        // Verify room type belongs to dormitory
        const [types] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM room_types WHERE id = ? AND dormitory_id = ?',
            [roomTypeId, dormitoryId]
        );

        if (types.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.ROOM_TYPE.NOT_FOUND));
        }

        await conn.execute('DELETE FROM room_types WHERE id = ?', [roomTypeId]);

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.ROOM_TYPE.DELETE_SUCCESS));

    } catch (err) {
        console.error('Delete room type error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};
