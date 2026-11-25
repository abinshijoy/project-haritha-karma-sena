import { Router } from 'express';
import { listPoints, createPoint, getUserPointBalance } from '../controllers/pointController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listPoints);
router.get('/balance/:userId', getUserPointBalance);
router.post('/', requireRole('ADMIN'), createPoint);

export default router;
