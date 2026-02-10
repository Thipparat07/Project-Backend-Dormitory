// Tenant-related Routes
import express from 'express';
import { joinDormitory, getJoinRequests, approveJoinRequest, getMyTenants, getDormitoryForJoin, getMyDormitory, addTenant, updateTenant, removeTenant } from '../controllers/tenantController';
import { jwtAuthen } from '../utils/jwtauth';

const router = express.Router();

// --- สำหรับผู้เช่า (Tenant-facing) ---
// ค้นหาข้อมูลหอพักก่อนเข้าร่วม (ใช้ Join Code)
router.get('/join-info', jwtAuthen, getDormitoryForJoin);
// ดูข้อมูลหอพักที่ตนเองพักอยู่ (หลังจากได้รับการอนุมัติ)
router.get('/my-dormitory', jwtAuthen, getMyDormitory);
// ส่งคำขอเข้าพักในหอพัก
router.post('/join', jwtAuthen, joinDormitory);

// --- สำหรับเจ้าของหอพักจัดการผู้เช่า (Owner-facing) ---
// ดึงรายการคำขอเข้าพักที่รอการอนุมัติ (ใช้ dormitoryId)
router.get('/:id/join-requests', jwtAuthen, getJoinRequests);
// อนุมัติคำขอเข้าพักของผู้เช่า
router.put('/:id/join-requests/:tenantId/approve', jwtAuthen, approveJoinRequest);
// ดึงรายชื่อผู้เช่าปัจจุบันทั้งหมดในหอพัก
router.get('/:id/list', jwtAuthen, getMyTenants);

// จัดการข้อมูลผู้เช่าโดยตรง (Manual Add, Edit, Remove)
router.post('/:id/add', jwtAuthen, addTenant);
router.put('/:id/update/:tenantId', jwtAuthen, updateTenant);
router.delete('/:id/remove/:tenantId', jwtAuthen, removeTenant);

export default router;
