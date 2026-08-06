import { Router } from 'express';
import * as citiesController from '../controllers/cities.controller';

const router = Router();

// Public, no auth — mirrors the public-GET pattern in cuisines.routes.ts.
router.get('/', citiesController.list);

export default router;
