import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as profileController from '../controllers/profile.controller';

const router = Router();

// All profile routes require authentication
router.use(requireAuth);

router.get('/',   profileController.getProfile);
router.patch('/', profileController.updateProfile);

export default router;
