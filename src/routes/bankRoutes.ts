import express from 'express';
import { addBank } from '../controllers/bankController';
import { jwtAuthen } from '../utils/jwtauth';

const router = express.Router();

router.post('/', jwtAuthen, addBank);

export default router;
