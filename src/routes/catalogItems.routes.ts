import { Router } from 'express';
import * as catalogItemsController from '../controllers/catalogItems.controller';

const router = Router();

// Public, no auth — mirrors the public-GET pattern in restaurants.routes.ts. Cross-restaurant
// feed of active catalog items belonging to active restaurants; see catalogItems.service.ts.
router.get('/', catalogItemsController.list);

export default router;
