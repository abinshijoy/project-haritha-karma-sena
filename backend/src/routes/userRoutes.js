import { Router } from 'express';
import { listUsers, createUser, getUser, updateUser } from '../controllers/userController.js';
import { requireAuth, requireRole, requireSelfOrAdmin } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', requireRole('ADMIN'), listUsers);
router.post('/', requireRole('ADMIN'), createUser);
router.get('/:id', requireSelfOrAdmin('id'), getUser);
router.patch('/:id', requireSelfOrAdmin('id'), updateUser);

export default router;
