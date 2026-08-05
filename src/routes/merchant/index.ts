import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as merchantController from '../../controllers/merchant.controller';
import { requireMerchant } from '../../middleware/auth';
import catalogItemsRoutes from './catalogItems.routes';
import restaurantRoutes from './restaurant.routes';
import ordersRoutes from './orders.routes';

const router = Router();

// Guards against application spam from a single source.
const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

// Tighter window: guards against invite-token guessing/brute-forcing, not just spam.
const inviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/apply',         applyLimiter,  merchantController.apply);
router.get('/invite/:token',  inviteLimiter, merchantController.getInvite);
router.post('/invite/:token', inviteLimiter, merchantController.acceptInvite);

// Authenticated merchant-only routes (requireMerchant), scoped to the caller's own
// restaurant_id — distinct from the public apply/invite routes above.
router.use('/catalog-items', requireMerchant, catalogItemsRoutes);
router.use('/restaurant', requireMerchant, restaurantRoutes);
router.use('/orders', requireMerchant, ordersRoutes);

export default router;
