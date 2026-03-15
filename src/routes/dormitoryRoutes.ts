import express from 'express';
import { createDormitory, getDormitoryRooms, updateFurnitureFee, assignRoomType, getOwnerDormitories, getDormitoryById } from '../controllers/dormitoryController';
import { createRoomType, getRoomTypes, updateRoomType, deleteRoomType } from '../controllers/roomTypeController';
import { createOrUpdateUtility, getUtility } from '../controllers/utilityController';
import { jwtAuthen } from '../utils/jwtauth';
import { requireOwner } from '../middleware/requireOwner';

const router = express.Router();

router.get('/', jwtAuthen, getOwnerDormitories);
router.post('/', jwtAuthen, createDormitory);
router.get('/:id', jwtAuthen, requireOwner, getDormitoryById);

router.get('/:id/rooms', jwtAuthen, requireOwner, getDormitoryRooms);
router.put('/:id/rooms/furniture-fee', jwtAuthen, requireOwner, updateFurnitureFee);
router.put('/:id/rooms/assign-type', jwtAuthen, requireOwner, assignRoomType);

// Room Type Routes
router.post('/:id/room-types', jwtAuthen, requireOwner, createRoomType);
router.get('/:id/room-types', jwtAuthen, requireOwner, getRoomTypes);
router.put('/:id/room-types/:typeId', jwtAuthen, requireOwner, updateRoomType);
router.delete('/:id/room-types/:typeId', jwtAuthen, requireOwner, deleteRoomType);

// Utility Routes
router.post('/:id/utilities', jwtAuthen, requireOwner, createOrUpdateUtility);
router.get('/:id/utilities', jwtAuthen, requireOwner, getUtility);

export default router;
