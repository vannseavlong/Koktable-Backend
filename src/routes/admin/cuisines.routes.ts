import { Router } from 'express';
import * as cuisinesController from '../../controllers/admin/cuisines.controller';

const router = Router();

// /reorder is registered before /:id so it isn't swallowed by the param route.
router.get('/',          cuisinesController.list);
router.patch('/reorder', cuisinesController.reorder);
router.get('/:id',       cuisinesController.getById);
router.post('/',         cuisinesController.create);
router.patch('/:id',     cuisinesController.update);
router.delete('/:id',    cuisinesController.remove);

export default router;
