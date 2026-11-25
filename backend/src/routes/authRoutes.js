import { Router } from 'express';
import { requestOtp, verifyOtp, me, logout } from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/request-otp', requestOtp);
router.post('/verify-otp', verifyOtp);
router.get('/me', requireAuth, me);
router.post('/logout', requireAuth, logout);

export default router;
