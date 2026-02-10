import { Response } from 'express';
import { conn } from '../../db';
import { RowDataPacket } from 'mysql2';
import { AuthenticatedRequest } from '../models/request';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';

// ค้นหาหอพักด้วย Join Code (สำหรับ User ทั่วไป)
export const getDormitoryForJoin = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { join_code } = req.query;

        if (!join_code) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // ค้นหาหอพัก
        const [dorms] = await conn.query<RowDataPacket[]>(
            'SELECT id, name, address, phone FROM dormitories WHERE join_code = ?',
            [join_code]
        );

        if (dorms.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.TENANT.DORM_NOT_FOUND));
        }

        const dormitory = dorms[0];

        // ค้นหาห้องว่าง (Available rooms)
        // status = 'available' หรือ (status is null เพราะอาจจะไม่ update)
        // แต่ตาม flow ใหม่ เรามี column status แล้ว
        const [rooms] = await conn.query<RowDataPacket[]>(
            `SELECT r.id, r.room_number, r.floor_number, rt.price AS room_price, r.furniture_fee, r.status
             FROM rooms r
             JOIN room_types rt ON r.room_type_id = rt.id
             WHERE r.dormitory_id = ? AND r.status = 'available'
             ORDER BY r.floor_number, r.room_number`,
            [dormitory.id]
        );

        const floors = [...new Set(rooms.map(room => room.floor_number))].sort((a, b) => a - b);

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.DORMITORY.GET_SUCCESS, {
            dormitory,
            rooms,
            floors
        }));

    } catch (err) {
        console.error('Get dormitory for join error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// ผู้เช่าขอเข้าร่วมหอพัก
export const joinDormitory = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const { join_code, national_id, date_of_birth, nationality, address, id_card_image, room_id } = req.body;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        if (!join_code || !room_id) { // บังคับเลือกห้อง
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // ค้นหาหอพักจาก Join Code
        const [dorms] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM dormitories WHERE join_code = ?',
            [join_code]
        );

        if (dorms.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.TENANT.DORM_NOT_FOUND));
        }

        const dormitoryId = dorms[0].id;

        // ตรวจสอบว่าเคย Join หรือยัง
        const [existing] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM tenants WHERE user_id = ? AND dormitory_id = ?',
            [user.id, dormitoryId]
        );

        if (existing.length > 0) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.TENANT.ALREADY_JOINED));
        }

        // ตรวจสอบห้องว่าว่างจริงไหม
        const [roomCheck] = await conn.query<RowDataPacket[]>(
            `SELECT id FROM rooms WHERE id = ? AND dormitory_id = ? AND status = 'available'`,
            [room_id, dormitoryId]
        );

        if (roomCheck.length === 0) {
            // ห้องไม่ว่างหรือไม่มีจริง
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.ROOM.ROOM_NOT_AVAILABLE));
        }


        // สร้าง record ใน tenants (Status = pending, Room = room_id)
        await conn.execute(
            `INSERT INTO tenants (user_id, dormitory_id, room_id, join_status, national_id, date_of_birth, nationality, address, id_card_image, joined_at) 
             VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, NOW())`,
            [
                user.id,
                dormitoryId,
                room_id,
                national_id || null,
                date_of_birth || null,
                nationality || null,
                address || null,
                id_card_image || null
            ]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.TENANT.JOIN_REQUEST_SUCCESS));

    } catch (err) {
        console.error('Join dormitory error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// เจ้าของหอดูคำขอเข้าร่วม (Pending)
export const getJoinRequests = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Verify ownership
        const [dorms] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitoryId, user.id]
        );

        if (dorms.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // ดึงข้อมูล Tenants ที่ user_id ตรงกับ users และ status = pending
        // Join rooms เพื่อแสดงชื่อห้องที่เขาขอมาด้วย
        const sql = `
            SELECT t.*, u.full_name, u.email, u.phone, u.profile_picture,
                   r.room_number, r.floor_number
            FROM tenants t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN rooms r ON t.room_id = r.id
            WHERE t.dormitory_id = ? AND t.join_status = 'pending'
        `;
        const [requests] = await conn.query<RowDataPacket[]>(sql, [dormitoryId]);

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.TENANT.GET_SUCCESS, requests));

    } catch (err) {
        console.error('Get join requests error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// เจ้าของหออนุมัติ + อาจจะเปลี่ยนห้องให้ได้ถ้าต้องการ
export const approveJoinRequest = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const tenantId = req.params.tenantId;
        let { room_id } = req.body;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Verify ownership
        const [dorms] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitoryId, user.id]
        );

        if (dorms.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // ถ้า Owner ไม่ได้ส่ง room_id มา ให้ใช้ room_id ที่ Tenant เลือกไว้ตอนขอ Join
        if (!room_id) {
            const [tenant] = await conn.query<RowDataPacket[]>('SELECT room_id FROM tenants WHERE id = ?', [tenantId]);
            if (tenant.length > 0 && tenant[0].room_id) {
                room_id = tenant[0].room_id;
            } else {
                return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
            }
        }

        // ตรวจสอบว่าห้องว่างไหม (Optional: ถ้าซีเรียสเรื่องห้องซ้ำ)
        // const [roomCheck] = await conn.query<RowDataPacket[]>('SELECT status FROM rooms WHERE id = ?', [room_id]);
        // if (roomCheck[0].status === 'occupied') ...

        // Update Tenant: status -> approved, room_id -> assigned/comfirmed
        await conn.execute(
            `UPDATE tenants SET join_status = 'approved', room_id = ? WHERE id = ? AND dormitory_id = ?`,
            [room_id, tenantId, dormitoryId]
        );

        // Update Room: status -> occupied
        await conn.execute(
            `UPDATE rooms SET status = 'occupied' WHERE id = ?`,
            [room_id]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.TENANT.APPROVE_SUCCESS));

    } catch (err) {
        console.error('Approve join request error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// ดูรายชื่อผู้เช่าปัจจุบัน (Approved)
export const getMyTenants = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Verify ownership
        const [dorms] = await conn.query<RowDataPacket[]>(
            'SELECT id FROM dormitories WHERE id = ? AND owner_id = ?',
            [dormitoryId, user.id]
        );
        if (dorms.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        const sql = `
            SELECT t.*, u.full_name, u.email, u.phone, u.profile_picture,
                   r.room_number, r.floor_number
            FROM tenants t
            JOIN users u ON t.user_id = u.id
            LEFT JOIN rooms r ON t.room_id = r.id
            WHERE t.dormitory_id = ? AND t.join_status = 'approved'
        `;
        const [tenants] = await conn.query<RowDataPacket[]>(sql, [dormitoryId]);

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.TENANT.GET_SUCCESS, tenants));

    } catch (err) {
        console.error('Get my tenants error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// ผู้เช่าดูข้อมูลหอพักตัวเอง (หลังจาก Join แล้ว)
export const getMyDormitory = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // หา dormitory_id จาก tenants table
        const [tenants] = await conn.query<RowDataPacket[]>(
            `SELECT t.*, r.room_number, r.floor_number, rt.price AS room_price, r.furniture_fee
             FROM tenants t
             LEFT JOIN rooms r ON t.room_id = r.id
             LEFT JOIN room_types rt ON r.room_type_id = rt.id
             WHERE t.user_id = ? AND t.join_status = 'approved'`,
            [user.id]
        );

        if (tenants.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.TENANT.REQUEST_NOT_FOUND));
        }

        const tenant = tenants[0];
        const dormitoryId = tenant.dormitory_id;

        // ดึงข้อมูลหอพัก
        const [dormitories] = await conn.query<RowDataPacket[]>(
            'SELECT * FROM dormitories WHERE id = ?',
            [dormitoryId]
        );

        if (dormitories.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.OWNER_NOT_FOUND)); // Reuse or create new
        }

        const dormitory = dormitories[0];

        // ดึงข้อมูลธนาคาร
        const [banks] = await conn.query<RowDataPacket[]>(
            'SELECT bank_name, account_number, account_name FROM bank_accounts WHERE dormitory_id = ?',
            [dormitoryId]
        );

        // ดึงข้อมูลค่าน้ำค่าไฟ
        const [utilities] = await conn.query<RowDataPacket[]>(
            'SELECT water_rate, electricity_rate FROM room_utilities WHERE dormitory_id = ?',
            [dormitoryId]
        );

        const responseData = {
            dormitory: {
                name: dormitory.name,
                address: dormitory.address,
                phone: dormitory.phone,
                bill_date: dormitory.bill_generation_day // วันทำบิล
            },
            room: {
                room_number: tenant.room_number,
                floor_number: tenant.floor_number,
                price: tenant.room_price
            },
            utilities: utilities.length > 0 ? utilities[0] : { water_rate: 0, electricity_rate: 0 },
            bank_accounts: banks
        };

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.DORMITORY.GET_SUCCESS, responseData));

    } catch (err) {
        console.error('Get my dormitory error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// เจ้าของเพิ่มผู้เช่าเอง (Manual Add)
export const addTenant = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { email, room_id, national_id, phone, full_name, date_of_birth, nationality, address, id_card_image } = req.body;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Validate required fields (Email is crucial to link user)
        if (!email || !room_id) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // Verify ownership
        const [dorms] = await conn.query<RowDataPacket[]>('SELECT id FROM dormitories WHERE id = ? AND owner_id = ?', [dormitoryId, user.id]);
        if (dorms.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // Find User by Email
        const [users] = await conn.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            // กรณีไม่เจอ User: อาจจะต้องสร้าง User ใหม่ หรือแจ้ง Error
            // สำหรับตอนนี้ให้ Error ว่าต้องสมัครสมาชิกก่อน
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.AUTH.USER_NOT_FOUND));
        }
        const userId = users[0].id;

        // Check availability
        const [roomCheck] = await conn.query<RowDataPacket[]>('SELECT status FROM rooms WHERE id = ? AND dormitory_id = ?', [room_id, dormitoryId]);
        if (roomCheck.length === 0 || roomCheck[0].status === 'occupied') {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.ROOM.ROOM_NOT_AVAILABLE));
        }

        // Check if already tenant
        const [existing] = await conn.query<RowDataPacket[]>('SELECT id FROM tenants WHERE user_id = ? AND dormitory_id = ?', [userId, dormitoryId]);
        if (existing.length > 0) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.TENANT.ALREADY_JOINED));
        }

        // Insert Tenant (Approved immediately)
        await conn.execute(
            `INSERT INTO tenants (user_id, dormitory_id, room_id, join_status, national_id, date_of_birth, nationality, address, id_card_image, joined_at) 
             VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?, NOW())`,
            [userId, dormitoryId, room_id, national_id, date_of_birth, nationality, address, id_card_image]
        );

        // Update User info (Optional: if provided)
        if (phone || full_name) {
            await conn.execute('UPDATE users SET phone = COALESCE(?, phone), full_name = COALESCE(?, full_name) WHERE id = ?', [phone, full_name, userId]);
        }

        // Update Room Status
        await conn.execute("UPDATE rooms SET status = 'occupied' WHERE id = ?", [room_id]);

        res.status(201).json(ResponseTemplate.success(RES_MESSAGES.TENANT.APPROVE_SUCCESS)); // Reusing success message

    } catch (err) {
        console.error('Add tenant error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// เจ้าของแก้ไขข้อมูลผู้เช่า
export const updateTenant = async (req: AuthenticatedRequest, res: Response) => {
    const connection = await conn.getConnection();
    try {
        await connection.beginTransaction();

        const user = req.auth;
        const dormitoryId = req.params.id;
        const tenantId = req.params.tenantId;
        const { national_id, date_of_birth, nationality, address, id_card_image, full_name, phone } = req.body;

        if (!user) {
            connection.release();
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Verify ownership
        const [dorms] = await connection.query<RowDataPacket[]>('SELECT id FROM dormitories WHERE id = ? AND owner_id = ?', [dormitoryId, user.id]);
        if (dorms.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // Get Tenant to find User ID
        const [tenants] = await connection.query<RowDataPacket[]>('SELECT user_id FROM tenants WHERE id = ? AND dormitory_id = ?', [tenantId, dormitoryId]);
        if (tenants.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.TENANT.REQUEST_NOT_FOUND));
        }
        const userId = tenants[0].user_id;

        // Update Tenant Table
        await connection.execute(
            `UPDATE tenants 
             SET national_id = COALESCE(?, national_id), 
                 date_of_birth = COALESCE(?, date_of_birth),
                 nationality = COALESCE(?, nationality),
                 address = COALESCE(?, address),
                 id_card_image = COALESCE(?, id_card_image)
             WHERE id = ?`,
            [
                national_id ?? null,
                date_of_birth ?? null,
                nationality ?? null,
                address ?? null,
                id_card_image ?? null,
                tenantId
            ]
        );

        // Update User Table (Name, Phone)
        if (full_name !== undefined || phone !== undefined) {
            await connection.execute(
                `UPDATE users SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone) WHERE id = ?`,
                [full_name ?? null, phone ?? null, userId]
            );
        }

        await connection.commit();
        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.TENANT.UPDATE_SUCCESS));

    } catch (err) {
        await connection.rollback();
        console.error('Update tenant error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    } finally {
        connection.release();
    }
};

// เจ้าของลบผู้เช่า (ย้ายออก / Move Out) -> คืนห้องว่าง
export const removeTenant = async (req: AuthenticatedRequest, res: Response) => {
    const connection = await conn.getConnection();
    try {
        await connection.beginTransaction();

        const user = req.auth;
        const dormitoryId = req.params.id;
        const tenantId = req.params.tenantId;

        if (!user) {
            connection.release();
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Verify ownership
        const [dorms] = await connection.query<RowDataPacket[]>('SELECT id FROM dormitories WHERE id = ? AND owner_id = ?', [dormitoryId, user.id]);
        if (dorms.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // Get Tenant Info
        const [tenants] = await connection.query<RowDataPacket[]>('SELECT room_id FROM tenants WHERE id = ? AND dormitory_id = ?', [tenantId, dormitoryId]);
        if (tenants.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.TENANT.REQUEST_NOT_FOUND));
        }
        const roomId = tenants[0].room_id;

        // Soft Delete / Move Out logic
        await connection.execute(
            "UPDATE tenants SET join_status = 'moved_out' WHERE id = ?",
            [tenantId]
        );

        // Update Room Status back to Available
        if (roomId) {
            await connection.execute("UPDATE rooms SET status = 'available' WHERE id = ?", [roomId]);
        }

        await connection.commit();
        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.TENANT.DELETE_SUCCESS));

    } catch (err) {
        await connection.rollback();
        console.error('Remove tenant error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    } finally {
        connection.release();
    }
};
