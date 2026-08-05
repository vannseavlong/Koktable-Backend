import { Router } from 'express';
import * as cuisinesController from '../controllers/cuisines.controller';

const router = Router();

// Public, no auth — mirrors the public-GET pattern in categories.routes.ts.
router.get('/', cuisinesController.list);

export default router;
