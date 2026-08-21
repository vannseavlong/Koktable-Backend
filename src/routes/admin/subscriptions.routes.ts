import { Router } from 'express';
import * as subscriptionsController from '../../controllers/admin/subscriptions.controller';

// mergeParams: true so :id (the parent restaurant) from the mount point in
// restaurants.routes.ts is visible on req.params here — same pattern as
// restaurantLocations.routes.ts.
const router = Router({ mergeParams: true });

router.get('/',   subscriptionsController.get);
router.patch('/', subscriptionsController.update);

export default router;
