import { Router } from 'express';
import * as categoriesController from '../controllers/categories.controller';

const router = Router();

// Public, no auth — mirrors the public-GET pattern in restaurants.routes.ts.
router.get('/', categoriesController.list);

export default router;
