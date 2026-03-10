// Billing Routes
import express from 'express';
import { jwtAuthen } from '../utils/jwtauth';
import { recordMeterReading, getMeterReadings, generateBill, getBills, getMyBills, uploadPaymentProof, updateBillStatus, getBillStats } from '../controllers/billingController';
import { requireOwner } from '../middleware/requireOwner';
import { requireDormRole } from '../middleware/roleMiddleware';

const router = express.Router();

router.post('/:id/meter-readings', jwtAuthen, requireOwner, recordMeterReading);
router.get('/:id/meter-readings', jwtAuthen, requireOwner, getMeterReadings);

router.post('/:id/bills/generate', jwtAuthen, requireOwner, generateBill);
router.get('/:id/bills', jwtAuthen, requireOwner, getBills);
router.get('/:id/my-bills', jwtAuthen, requireDormRole('tenant'), getMyBills); // Tenant

router.post('/:id/bills/:billId/payment', jwtAuthen, requireDormRole('tenant'), uploadPaymentProof); // Tenant
router.put('/:id/bills/:billId/status', jwtAuthen, requireOwner, updateBillStatus); // Owner

router.get('/:id/stats/expenses', jwtAuthen, requireDormRole('tenant'), getBillStats); // Tenant Charts

export default router;