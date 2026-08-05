import { Router } from 'express';
import * as restaurantController from '../../controllers/merchant/restaurant.controller';
import { upload } from '../../middleware/upload';

const router = Router();

const restaurantImageFields = upload.fields([
  { name: 'logo',   maxCount: 1 },
  { name: 'banner', maxCount: 1 },
]);

router.get('/',   restaurantController.getOwn);
router.patch('/', restaurantImageFields, restaurantController.updateOwn);
router.put('/hours', restaurantController.updateOwnHours);
router.patch('/location', restaurantController.updateOwnLocation);

export default router;
