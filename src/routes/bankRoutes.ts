import express from 'express';
import { Banks, getAllBanks, updateBank, deleteBank } from '../controllers/bankController';
import { jwtAuthen } from '../utils/jwtauth';

const router = express.Router();

router.post('/', jwtAuthen, Banks);
router.get('/', jwtAuthen, getAllBanks);
router.put('/:id', jwtAuthen, updateBank);
router.delete('/:id', jwtAuthen, deleteBank);

export default router;
