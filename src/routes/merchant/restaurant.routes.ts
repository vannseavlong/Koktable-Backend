import { Router } from 'express';
import * as restaurantController from '../../controllers/merchant/restaurant.controller';
import { upload } from '../../middleware/upload';

const router = Router();

const restaurantImageFields = upload.fields([
  { name: 'logo',   maxCount: 1 },
  { name: 'banner', maxCount: 1 },
]);

// Cap matches the multer field's maxCount below — a merchant can attach up to 10 new
// photos per save; existing photos to keep are re-submitted via the `keep` field
// instead of re-uploaded (see restaurant.controller.ts's updateOwnGallery).
const galleryImageField = upload.array('gallery', 10);

router.get('/',   restaurantController.getOwn);
router.patch('/', restaurantImageFields, restaurantController.updateOwn);
router.put('/hours', restaurantController.updateOwnHours);
router.put('/cuisines', restaurantController.updateOwnCuisines);
router.put('/gallery', galleryImageField, restaurantController.updateOwnGallery);
router.patch('/location', restaurantController.updateOwnLocation)
router.get('/subscription', restaurantController.getOwnSubscription);

export default router;
