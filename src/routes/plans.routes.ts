import { Router } from 'express';
import * as plansController from '../controllers/plans.controller';

// Public, no auth — mirrors the public-GET pattern in cuisines.routes.ts.
const router = Router();

router.get('/', plansController.list);

export default router;
