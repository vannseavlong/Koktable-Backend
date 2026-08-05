import { Router } from 'express';
import * as restaurantLocationsController from '../../controllers/admin/restaurantLocations.controller';

// mergeParams: true so :id (the parent restaurant) from the mount point in
// restaurants.routes.ts is visible on req.params here.
const router = Router({ mergeParams: true });

router.post('/',              restaurantLocationsController.create);
router.patch('/:locationId',  restaurantLocationsController.update);

export default router;
