import { Router } from 'express';
import * as districtsController from '../../controllers/admin/districts.controller';

const router = Router();

// /reorder is registered before /:id so it isn't swallowed by the param route.
router.get('/',          districtsController.list);
router.patch('/reorder', districtsController.reorder);
router.get('/:id',       districtsController.getById);
router.post('/',         districtsController.create);
router.patch('/:id',     districtsController.update);
router.delete('/:id',    districtsController.remove);

export default router;
