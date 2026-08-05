import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as merchantApplicationsController from '../../controllers/admin/merchantApplications.controller';

const router = Router();

// Same tier as the public /merchant/invite/:token limiter (routes/merchant/index.ts) —
// this also triggers an EmailJS send and issues a real credential, so it's worth
// guarding even though it sits behind requireAdmin (e.g. against a compromised admin
// session, or just fat-fingered rapid re-clicking).
const resendInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/',              merchantApplicationsController.list);
router.get('/:id',           merchantApplicationsController.getById);
router.post('/:id/approve',  merchantApplicationsController.approve);
router.post('/:id/reject',   merchantApplicationsController.reject);
router.post('/:id/resend-invite', resendInviteLimiter, merchantApplicationsController.resendInvite);

export default router;
