import { Router } from 'express';
import * as dashboardController from '../../controllers/admin/dashboard.controller';

const router = Router();

router.get('/overview', dashboardController.getOverview);

export default router;
