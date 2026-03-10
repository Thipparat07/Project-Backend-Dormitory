// Tenant-related Routes
import express from 'express';
import { joinDormitory, getJoinRequests, approveJoinRequest, getMyTenants, getDormitoryForJoin, getMyDormitory, addTenant, updateTenant, removeTenant, getTenantDormitories, getAvailableFloors, getAvailableRooms } from '../controllers/tenantController';
import { jwtAuthen } from '../utils/jwtauth';
import { requireOwner } from '../middleware/requireOwner';

const router = express.Router();

// --- สำหรับผู้เช่า (Tenant-facing) ---
// ค้นหาข้อมูลหอพักก่อนเข้าร่วม (ใช้ Join Code)
router.get('/join-info', jwtAuthen, getDormitoryForJoin);
// ดึงชั้นที่มีห้องว่าง
router.get('/:dormitoryId/available-floors', jwtAuthen, getAvailableFloors);
// ดึงห้องว่างตามชั้น
router.get('/:dormitoryId/floors/:floor/available-rooms', jwtAuthen, getAvailableRooms);
// ดูรายชื่อหอพักทั้งหมดที่ตนเองเป็นสมาชิกอยู่
router.get('/my-dormitories', jwtAuthen, getTenantDormitories);
// ดูข้อมูลหอพักที่ตนเองพักอยู่ (หลังจากได้รับการอนุมัติ) (อาจจะไม่ได้ใช้แล้วถ้าใช้ my-dormitories แทน แต่เก็บไว้ก่อน)
router.get('/my-dormitory', jwtAuthen, getMyDormitory);
// ส่งคำขอเข้าพักในหอพัก
router.post('/join', jwtAuthen, joinDormitory);

// --- สำหรับเจ้าของหอพักจัดการผู้เช่า (Owner-facing) ---
// ดึงรายการคำขอเข้าพักที่รอการอนุมัติ (ใช้ dormitoryId)
router.get('/:id/join-requests', jwtAuthen, requireOwner, getJoinRequests);
// อนุมัติคำขอเข้าพักของผู้เช่า
router.put('/:id/join-requests/:tenantId/approve', jwtAuthen, requireOwner, approveJoinRequest);
// ดึงรายชื่อผู้เช่าปัจจุบันทั้งหมดในหอพัก
router.get('/:id/list', jwtAuthen, requireOwner, getMyTenants);

// จัดการข้อมูลผู้เช่าโดยตรง (Manual Add, Edit, Remove)
router.post('/:id/add', jwtAuthen, requireOwner, addTenant);
router.put('/:id/update/:tenantId', jwtAuthen, requireOwner, updateTenant);
router.delete('/:id/remove/:tenantId', jwtAuthen, requireOwner, removeTenant);

export default router;
