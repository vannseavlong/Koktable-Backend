import { Router } from 'express';
import * as servicesController from '../../controllers/admin/services.controller';

const router = Router();

// /reorder is registered before /:id so it isn't swallowed by the param route.
router.get('/',           servicesController.list);
router.patch('/reorder',  servicesController.reorder);
router.get('/:id',        servicesController.getById);
router.post('/',          servicesController.create);
router.patch('/:id',      servicesController.update);
router.delete('/:id',     servicesController.remove);

export default router;
