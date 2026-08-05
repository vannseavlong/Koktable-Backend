import { Router } from 'express';
import * as restaurantsController from '../controllers/restaurants.controller';

const router = Router();

// All public, no auth — mirrors the public-GET pattern in services.routes.ts.
// Only active restaurants/items are ever visible here; see restaurants.service.ts.
router.get('/',                     restaurantsController.list);
router.get('/:id',                  restaurantsController.getById);
router.get('/:id/catalog-items',    restaurantsController.listCatalogItems);

export default router;
