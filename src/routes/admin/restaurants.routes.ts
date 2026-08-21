import { Router } from 'express';
import * as restaurantsController from '../../controllers/admin/restaurants.controller';
import restaurantLocationsRoutes from './restaurantLocations.routes';
import subscriptionsRoutes from './subscriptions.routes';

const router = Router();

router.get('/',      restaurantsController.list);
router.get('/:id',   restaurantsController.getById);
router.patch('/:id', restaurantsController.updateStatus);

router.use('/:id/locations',     restaurantLocationsRoutes);
router.use('/:id/subscription',  subscriptionsRoutes);

export default router;
