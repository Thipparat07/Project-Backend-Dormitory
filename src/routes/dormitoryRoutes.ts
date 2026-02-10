import express from 'express';
import { createDormitory, getDormitoryRooms, updateRoomRent, assignRoomType } from '../controllers/dormitoryController';
import { createRoomType, getRoomTypes, updateRoomType, deleteRoomType } from '../controllers/roomTypeController';
import { createOrUpdateUtility, getUtility } from '../controllers/utilityController';
import { joinDormitory, getJoinRequests, approveJoinRequest, getMyTenants, getDormitoryForJoin, getMyDormitory, addTenant, updateTenant, removeTenant } from '../controllers/tenantController';
import { jwtAuthen } from '../utils/jwtauth';

const router = express.Router();

router.post('/', jwtAuthen, createDormitory);

// Public: Get Dorm by Join Code (ไม่ต้อง Login? หรือ Login user ทั่วไป) -> Login user ทั่วไป
router.get('/join-info', jwtAuthen, getDormitoryForJoin);

// Tenant View Own Dorm
router.get('/my-dormitory', jwtAuthen, getMyDormitory);

// User Request to Join
router.post('/join', jwtAuthen, joinDormitory);

router.get('/:id/rooms', jwtAuthen, getDormitoryRooms);
router.put('/:id/rooms/rent', jwtAuthen, updateRoomRent);
router.put('/:id/rooms/assign-type', jwtAuthen, assignRoomType);

// Room Type Routes
router.post('/:id/room-types', jwtAuthen, createRoomType);
router.get('/:id/room-types', jwtAuthen, getRoomTypes);
router.put('/:id/room-types/:typeId', jwtAuthen, updateRoomType);
router.delete('/:id/room-types/:typeId', jwtAuthen, deleteRoomType);

// Utility Routes
router.post('/:id/utilities', jwtAuthen, createOrUpdateUtility);
router.get('/:id/utilities', jwtAuthen, getUtility);

// Owner Manage Requests
router.get('/:id/join-requests', jwtAuthen, getJoinRequests);
router.put('/:id/join-requests/:tenantId/approve', jwtAuthen, approveJoinRequest);
router.get('/:id/tenants', jwtAuthen, getMyTenants);

// Owner Manage Tenants (Manual Add, Edit, Remove) 
router.post('/:id/tenants', jwtAuthen, addTenant);
router.put('/:id/tenants/:tenantId', jwtAuthen, updateTenant); // --ยังไม่Test--
router.delete('/:id/tenants/:tenantId', jwtAuthen, removeTenant); // --ยังไม่Test--

export default router;
