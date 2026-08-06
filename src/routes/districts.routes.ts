import { Router } from 'express';
import * as districtsController from '../controllers/districts.controller';

const router = Router();

// Public, no auth — mirrors the public-GET pattern in cuisines.routes.ts.
// Accepts ?city_id= to scope the list to one city's districts.
router.get('/', districtsController.list);

export default router;
