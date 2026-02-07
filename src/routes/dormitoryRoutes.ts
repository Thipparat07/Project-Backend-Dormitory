import express from 'express';
import { createDormitory } from '../controllers/dormitoryController';
import { jwtAuthen } from '../utils/jwtauth';

const router = express.Router();

router.post('/', jwtAuthen, createDormitory);

export default router;
