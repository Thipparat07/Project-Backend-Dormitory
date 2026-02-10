// Billing Routes
import express from 'express';
import { jwtAuthen } from '../utils/jwtauth';
import { recordMeterReading, getMeterReadings, generateBill, getBills, getMyBills, uploadPaymentProof, updateBillStatus, getBillStats } from '../controllers/billingController';

const router = express.Router();

router.post('/:id/meter-readings', jwtAuthen, recordMeterReading);
router.get('/:id/meter-readings', jwtAuthen, getMeterReadings);

router.post('/:id/bills/generate', jwtAuthen, generateBill);
router.get('/:id/bills', jwtAuthen, getBills);
router.get('/:id/my-bills', jwtAuthen, getMyBills); // Tenant

router.post('/:id/bills/:billId/payment', jwtAuthen, uploadPaymentProof); // Tenant
router.put('/:id/bills/:billId/status', jwtAuthen, updateBillStatus); // Owner

router.get('/:id/stats/expenses', jwtAuthen, getBillStats); // Tenant Charts

export default router;