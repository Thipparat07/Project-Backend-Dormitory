import express from 'express';
import { createDormitory, getDormitoryRooms, updateRoomRent, assignRoomType } from '../controllers/dormitoryController';
import { createRoomType, getRoomTypes, updateRoomType, deleteRoomType } from '../controllers/roomTypeController';
import { jwtAuthen } from '../utils/jwtauth';

const router = express.Router();

router.post('/', jwtAuthen, createDormitory);
router.get('/:id/rooms', jwtAuthen, getDormitoryRooms);
router.put('/:id/rooms/rent', jwtAuthen, updateRoomRent);
router.put('/:id/rooms/assign-type', jwtAuthen, assignRoomType);

// Room Type Routes
router.post('/:id/room-types', jwtAuthen, createRoomType);
router.get('/:id/room-types', jwtAuthen, getRoomTypes);
router.put('/:id/room-types/:typeId', jwtAuthen, updateRoomType);
router.delete('/:id/room-types/:typeId', jwtAuthen, deleteRoomType);

export default router;
