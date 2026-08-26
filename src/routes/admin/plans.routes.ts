import { Router } from 'express';
import * as plansController from '../../controllers/admin/plans.controller';

// No DELETE — a plan a subscription's `tier` still points at should never disappear
// outright; use PATCH { active: false } instead (same convention as cities/districts).
const router = Router();

router.get('/',      plansController.list);
router.get('/:id',   plansController.getById);
router.post('/',     plansController.create);
router.patch('/:id', plansController.update);

export default router;
