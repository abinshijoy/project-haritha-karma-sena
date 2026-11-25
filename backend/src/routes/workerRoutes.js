import { Router } from 'express';
import { listWorkers, getWorker, createWorker, updateWorker } from '../controllers/workerController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', requireRole('ADMIN'), listWorkers);
router.get('/:id', requireRole('ADMIN'), getWorker);
router.post('/', requireRole('ADMIN'), createWorker);
router.patch('/:id', requireRole('ADMIN'), updateWorker);

export default router;
