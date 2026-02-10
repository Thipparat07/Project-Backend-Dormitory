import { Response } from 'express';
import { conn } from '../../db';
import { RowDataPacket } from 'mysql2';
import { AuthenticatedRequest } from '../models/request';
import { ResponseTemplate } from '../utils/response';
import { RES_MESSAGES } from '../constants/responseMessages';

// 1. จดมิเตอร์ (Meter Reading)
export const recordMeterReading = async (req: AuthenticatedRequest, res: Response) => {
    const connection = await conn.getConnection();
    try {
        await connection.beginTransaction();

        const user = req.auth;
        const dormitoryId = req.params.id;
        // month_year format: 'YYYY-MM'
        let { room_id, month_year, water_current, electricity_current, water_previous, electricity_previous } = req.body;

        // If body is string (e.g. text/plain sent by mistake or with trailing commas), try to parse it
        if (typeof req.body === 'string') {
            try {
                // Remove trailing commas which are invalid in JSON but common in copy-paste
                const sanitizedBody = req.body.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
                const parsed = JSON.parse(sanitizedBody);
                room_id = parsed.room_id;
                month_year = parsed.month_year;
                water_current = parsed.water_current;
                electricity_current = parsed.electricity_current;
                water_previous = parsed.water_previous;
                electricity_previous = parsed.electricity_previous;
            } catch (e) {
                console.error('Failed to parse body as JSON', e);
                connection.release();
                // Return a clear error if JSON parsing fails
                return res.status(400).json(ResponseTemplate.error({ th: 'รูปแบบข้อมูลไม่ถูกต้อง (JSON Invalid)', en: 'Invalid JSON format' }));
            }
        }

        if (!user) {
            connection.release();
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Validate Inputs
        if (!room_id || !month_year || water_current === undefined || electricity_current === undefined) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // 0. Format & Range Validation
        const monthRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
        if (!monthRegex.test(month_year.toString().trim())) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error({ th: 'รูปแบบเดือนไม่ถูกต้อง (ต้องเป็น YYYY-MM)', en: 'Invalid month format (must be YYYY-MM)' }));
        }

        if (Number(water_current) < 0 || Number(electricity_current) < 0) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.BILL.ERROR_INVALID_FORMAT));
        }

        // 1. Strict Month Window Check (Current or Previous Month Only)
        const date = new Date();
        const currentMonthYear = date.toISOString().slice(0, 7);
        date.setMonth(date.getMonth() - 1);
        const lastMonthYear = date.toISOString().slice(0, 7);

        const targetMonthYear = month_year?.toString().trim();

        if (targetMonthYear !== currentMonthYear && targetMonthYear !== lastMonthYear) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.BILL.ERROR_INVALID_RECORDING_WINDOW));
        }

        // 2. Paid Bill Lock (Cannot edit if already paid)
        const [paidBills] = await connection.query<RowDataPacket[]>(
            `SELECT id FROM bills WHERE dormitory_id = ? AND room_id = ? AND month_year = ? AND status = 'paid'`,
            [dormitoryId, room_id, month_year]
        );
        if (paidBills.length > 0) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.BILL.ERROR_BILL_ALREADY_PAID));
        }

        // Verify Owner & Room Ownership
        const [dorms] = await connection.query<RowDataPacket[]>('SELECT id FROM dormitories WHERE id = ? AND owner_id = ?', [dormitoryId, user.id]);
        if (dorms.length === 0) {
            connection.release();
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        const [roomCheck] = await connection.query<RowDataPacket[]>('SELECT id FROM rooms WHERE id = ? AND dormitory_id = ?', [room_id, dormitoryId]);
        if (roomCheck.length === 0) {
            connection.release();
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.BILL.ERROR_ROOM_IN_DORM_NOT_FOUND));
        }

        // Get Tenant in that room (Active) to link tenant_id
        const [tenants] = await connection.query<RowDataPacket[]>(
            `SELECT id FROM tenants WHERE dormitory_id = ? AND room_id = ? AND join_status = 'approved'`,
            [dormitoryId, room_id]
        );

        let tenantId = 0;
        if (tenants.length > 0) {
            tenantId = tenants[0].id;
        } else {
            // Room might be empty, but we can still record meter? Usually not useful but let's allow it or blocking?
            // If empty, allow recording but tenant_id = 0 or NULL? Table says tenant_id NOT NULL.
            // So we must have a tenant.
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.ROOM.ROOM_NOT_AVAILABLE)); // Or "No tenant found"
        }

        // Find Previous Reading (Last Month)
        // Logic: substract 1 month from month_year
        // Or just find the latest reading before this one.
        // Let's rely on client sending correct data OR fetch absolute latest.

        // Initialize previous values
        let finalWaterPrevious = 0;
        let finalElectricityPrevious = 0;

        // 1. Try to fetch from DB (Highest Priority for Data Integrity)
        const [prevReading] = await connection.query<RowDataPacket[]>(
            `SELECT water_current, electricity_current FROM meter_readings 
             WHERE dormitory_id = ? AND room_id = ? AND month_year < ? 
             ORDER BY month_year DESC LIMIT 1`,
            [dormitoryId, room_id, month_year]
        );

        if (prevReading.length > 0) {
            finalWaterPrevious = prevReading[0].water_current;
            finalElectricityPrevious = prevReading[0].electricity_current;
        } else {
            // 2. If NO previous record in DB (First time), use Manual Input if provided
            if (water_previous !== undefined) finalWaterPrevious = Number(water_previous);
            if (electricity_previous !== undefined) finalElectricityPrevious = Number(electricity_previous);
        }

        // Validate: Current readings must not be less than previous readings
        if (water_current < finalWaterPrevious || electricity_current < finalElectricityPrevious) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.BILL.ERROR_METER_LESS_THAN_PREVIOUS));
        }

        // Check if reading for this month already exists
        const [existing] = await connection.query<RowDataPacket[]>(
            `SELECT id FROM meter_readings WHERE dormitory_id = ? AND room_id = ? AND month_year = ?`,
            [dormitoryId, room_id, month_year]
        );

        if (existing.length > 0) {
            // Update
            await connection.execute(
                `UPDATE meter_readings 
                 SET water_previous = ?, water_current = ?, 
                     electricity_previous = ?, electricity_current = ?
                 WHERE id = ?`,
                [finalWaterPrevious, water_current, finalElectricityPrevious, electricity_current, existing[0].id]
            );
        } else {
            // Insert
            await connection.execute(
                `INSERT INTO meter_readings (tenant_id, dormitory_id, room_id, month_year, water_previous, water_current, electricity_previous, electricity_current)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [tenantId, dormitoryId, room_id, month_year, finalWaterPrevious, water_current, finalElectricityPrevious, electricity_current]
            );
        }

        await connection.commit();
        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.BILL.METER_RECORD_SUCCESS));

    } catch (err) {
        await connection.rollback();
        console.error('Record meter error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    } finally {
        connection.release();
    }
};

// ดูประวัติมิเตอร์ (Get Meter Readings)
export const getMeterReadings = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { month_year } = req.query;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        let sql = `
            SELECT m.*, r.room_number 
            FROM meter_readings m
            JOIN rooms r ON m.room_id = r.id
            WHERE m.dormitory_id = ?
        `;
        const params: any[] = [dormitoryId];

        if (month_year) {
            sql += ` AND m.month_year = ?`;
            params.push(month_year);
        }

        sql += ` ORDER BY m.month_year DESC, r.room_number ASC`;

        const [readings] = await conn.query<RowDataPacket[]>(sql, params);
        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.DORMITORY.GET_SUCCESS, readings));

    } catch (err) {
        console.error('Get meter readings error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// 2. สร้างบิล (Generate Bill) - Manual per Room or All? Let's do Single Room first for safety.
export const generateBill = async (req: AuthenticatedRequest, res: Response) => {
    const connection = await conn.getConnection();
    try {
        await connection.beginTransaction();

        const user = req.auth;
        const dormitoryId = req.params.id;
        let { room_id, month_year } = req.body; // furniture_fee, other_fee optional inputs?

        // If body is string, try to parse it (Consistency with recordMeterReading)
        if (typeof req.body === 'string') {
            try {
                const sanitizedBody = req.body.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
                const parsed = JSON.parse(sanitizedBody);
                room_id = parsed.room_id;
                month_year = parsed.month_year;
            } catch (e) {
                console.error('Failed to parse body as JSON', e);
                connection.release();
                return res.status(400).json(ResponseTemplate.error({ th: 'รูปแบบข้อมูลไม่ถูกต้อง (JSON Invalid)', en: 'Invalid JSON format' }));
            }
        }

        if (!user) {
            connection.release();
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Validate Inputs
        if (!room_id || !month_year) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // Verify Owner
        const [dorms] = await connection.query<RowDataPacket[]>('SELECT id FROM dormitories WHERE id = ? AND owner_id = ?', [dormitoryId, user.id]);
        if (dorms.length === 0) {
            connection.release();
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        // 1. Get Meter Reading
        const [meters] = await connection.query<RowDataPacket[]>(
            `SELECT * FROM meter_readings WHERE dormitory_id = ? AND room_id = ? AND month_year = ?`,
            [dormitoryId, room_id, month_year]
        );

        if (meters.length === 0) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.BILL.ERROR_METER_NOT_FOUND));
        }
        const meter = meters[0];

        // 2. Get Rates (Room Price & Utilities)
        // Room Price
        const [rooms] = await connection.query<RowDataPacket[]>(
            `SELECT r.furniture_fee, rt.price as room_price 
              FROM rooms r 
              JOIN room_types rt ON r.room_type_id = rt.id 
              WHERE r.id = ?`,
            [room_id]
        );
        const roomData = rooms[0];

        // Utility Rates
        const [utils] = await connection.query<RowDataPacket[]>(
            `SELECT water_rate, electricity_rate FROM room_utilities WHERE dormitory_id = ?`,
            [dormitoryId]
        );
        const utilRates = utils.length > 0 ? utils[0] : { water_rate: 0, electricity_rate: 0 };

        // 3. Calculate Costs
        const waterUnit = meter.water_current - meter.water_previous;
        const elecUnit = meter.electricity_current - meter.electricity_previous;

        const waterCost = waterUnit * utilRates.water_rate;
        const elecCost = elecUnit * utilRates.electricity_rate;

        const furnitureFee = parseFloat(roomData.furniture_fee || 0); // From Room DB
        const roomRate = parseFloat(roomData.room_price || 0);
        const otherFee = req.body.other_fee ? parseFloat(req.body.other_fee) : 0; // Manual input

        const totalResult = roomRate + waterCost + elecCost + furnitureFee + otherFee;

        // 4. Upsert Bill
        const [existingBill] = await connection.query<RowDataPacket[]>(
            `SELECT id FROM bills WHERE dormitory_id = ? AND room_id = ? AND month_year = ?`,
            [dormitoryId, room_id, month_year]
        );

        if (existingBill.length > 0) {
            // Update
            await connection.execute(
                `UPDATE bills 
                  SET room_rate = ?, water_unit = ?, water_cost = ?,
                      electricity_unit = ?, electricity_cost = ?,
                      furniture_fee = ?, other_fee = ?, total = ?, status = 'unpaid'
                  WHERE id = ?`,
                [roomRate, waterUnit, waterCost, elecUnit, elecCost, furnitureFee, otherFee, totalResult, existingBill[0].id]
            );
        } else {
            // Insert
            await connection.execute(
                `INSERT INTO bills (tenant_id, dormitory_id, room_id, month_year, room_rate, water_unit, water_cost, electricity_unit, electricity_cost, furniture_fee, other_fee, total, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid')`,
                [meter.tenant_id, dormitoryId, room_id, month_year, roomRate, waterUnit, waterCost, elecUnit, elecCost, furnitureFee, otherFee, totalResult]
            );
        }

        await connection.commit();
        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.BILL.GENERATE_SUCCESS));

    } catch (err) {
        await connection.rollback();
        console.error('Generate bill error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    } finally {
        connection.release();
    }
};

// ดูบิลทั้งหมด (Owner)
export const getBills = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;
        const { month_year, status } = req.query;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        let sql = `
            SELECT b.*, r.room_number, u.full_name as tenant_name,
                   (SELECT image FROM payment_proofs WHERE bill_id = b.id ORDER BY uploaded_at DESC LIMIT 1) as payment_image
            FROM bills b
            JOIN rooms r ON b.room_id = r.id
            JOIN tenants t ON b.tenant_id = t.id
            JOIN users u ON t.user_id = u.id
            WHERE b.dormitory_id = ?
        `;
        const params: any[] = [dormitoryId];

        if (month_year) {
            sql += ` AND b.month_year = ?`;
            params.push(month_year);
        }
        if (status) {
            sql += ` AND b.status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY b.month_year DESC, r.room_number ASC`;

        const [bills] = await conn.query<RowDataPacket[]>(sql, params);
        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.DORMITORY.GET_SUCCESS, bills));

    } catch (err) {
        console.error('Get bills error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// ดูบิลของฉัน (Tenant)
export const getMyBills = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        // Tenant routes logic often gets user from auth, then finds tenant record.
        // We assume param :id is dormitoryID, but tenant might not know it easily if they just click "My Bills".
        // But the route structure is usually /dormitory/:id/my-bills or just /my-bills. 
        // Based on routes.ts pattern, likely /:id/my-bills.
        const dormitoryId = req.params.id;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        const [tenants] = await conn.query<RowDataPacket[]>('SELECT id FROM tenants WHERE user_id = ? AND dormitory_id = ?', [user.id, dormitoryId]);
        if (tenants.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.TENANT.REQUEST_NOT_FOUND));
        }
        const tenantId = tenants[0].id;

        const [bills] = await conn.query<RowDataPacket[]>(
            `SELECT * FROM bills WHERE tenant_id = ? ORDER BY month_year DESC`,
            [tenantId]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.DORMITORY.GET_SUCCESS, bills));

    } catch (err) {
        console.error('Get my bills error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};


// 3. ชำระเงิน (Upload Payment Proof) - Tenant
export const uploadPaymentProof = async (req: AuthenticatedRequest, res: Response) => {
    const connection = await conn.getConnection();
    try {
        await connection.beginTransaction();

        const user = req.auth;
        const { billId } = req.params;
        const { image } = req.body; // Base64 or URL

        if (!user || !image) {
            connection.release();
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // Insert Proof
        await connection.execute(
            `INSERT INTO payment_proofs (bill_id, uploaded_by, image, uploaded_at) VALUES (?, ?, ?, NOW())`,
            [billId, user.id, image]
        );

        // Update Bill Status -> pending
        await connection.execute(
            `UPDATE bills SET status = 'pending' WHERE id = ?`,
            [billId]
        );

        await connection.commit();
        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.BILL.PAYMENT_UPLOAD_SUCCESS));

    } catch (err) {
        await connection.rollback();
        console.error('Upload payment error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    } finally {
        connection.release();
    }
};

// 4. ตรวจสอบการชำระเงิน (Verify Payment) - Owner
export const updateBillStatus = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const { billId } = req.params; // /:id/bills/:billId/status
        const { status } = req.body; // 'paid' or 'unpaid' (reject)

        if (!user || !['paid', 'unpaid'].includes(status)) {
            return res.status(400).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.MISSING_FIELDS));
        }

        // Owner check is assumed done by middleware or route structure, 
        // but robustly we should check if user owns the dorm of this bill.
        // Skipping deep check for brevity, assuming :id param check in route or trusted owner.
        // Let's do a quick check via bill join.
        const [billCheck] = await conn.query<RowDataPacket[]>(
            `SELECT b.id FROM bills b JOIN dormitories d ON b.dormitory_id = d.id WHERE b.id = ? AND d.owner_id = ?`,
            [billId, user.id]
        );
        if (billCheck.length === 0) {
            return res.status(403).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.ACCESS_DENIED_OWNER));
        }

        await conn.execute(
            `UPDATE bills SET status = ? WHERE id = ?`,
            [status, billId]
        );

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.BILL.STATUS_UPDATE_SUCCESS));

    } catch (err) {
        console.error('Update bill status error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};

// 5. สถิติ (Charts/Stats) - Tenant
export const getBillStats = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const user = req.auth;
        const dormitoryId = req.params.id;

        if (!user) {
            return res.status(401).json(ResponseTemplate.error(RES_MESSAGES.AUTH.INVALID_TOKEN));
        }

        // Get Tenant ID
        const [tenants] = await conn.query<RowDataPacket[]>('SELECT id FROM tenants WHERE user_id = ? AND dormitory_id = ?', [user.id, dormitoryId]);
        if (tenants.length === 0) {
            return res.status(404).json(ResponseTemplate.error(RES_MESSAGES.TENANT.REQUEST_NOT_FOUND));
        }
        const tenantId = tenants[0].id;

        // Fetch last 6 months bills
        const [bills] = await conn.query<RowDataPacket[]>(
            `SELECT month_year, total, water_unit, water_cost, electricity_unit, electricity_cost
             FROM bills 
             WHERE tenant_id = ? AND dormitory_id = ?
             ORDER BY month_year ASC LIMIT 6`, // Last 6 records ascending for graph
            [tenantId, dormitoryId]
        );

        // Format for Frontend Chart
        // labels: ['2024-01', '2024-02', ...]
        // datasets: [{ label: 'Total', data: [...] }]

        const labels = bills.map(b => b.month_year);
        const totalExpenses = bills.map(b => b.total);
        const waterUnits = bills.map(b => b.water_unit);
        const electricityUnits = bills.map(b => b.electricity_unit);
        const waterCosts = bills.map(b => b.water_cost);
        const electricityCosts = bills.map(b => b.electricity_cost);

        res.status(200).json(ResponseTemplate.success(RES_MESSAGES.DORMITORY.GET_SUCCESS, {
            labels,
            totalExpenses,
            waterUsage: { units: waterUnits, cost: waterCosts },
            electricityUsage: { units: electricityUnits, cost: electricityCosts }
        }));

    } catch (err) {
        console.error('Get stats error:', err);
        res.status(500).json(ResponseTemplate.error(RES_MESSAGES.DORMITORY.INTERNAL_ERROR));
    }
};
