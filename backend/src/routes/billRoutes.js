import { Router } from 'express';
import { listBills, getBill, createBill, updateBill } from '../controllers/billController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listBills);
router.get('/:id', getBill);
router.post('/', requireRole('ADMIN'), createBill);
router.patch('/:id', requireRole('ADMIN'), updateBill);

export default router;
