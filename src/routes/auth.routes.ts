import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as authController from '../controllers/auth.controller';

const router = Router();

router.post('/register', authController.register);
router.post('/login',    authController.login);
router.get('/me', requireAuth, authController.me);

export default router;
