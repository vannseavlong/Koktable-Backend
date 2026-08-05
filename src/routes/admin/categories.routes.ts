import { Router } from 'express';
import * as categoriesController from '../../controllers/admin/categories.controller';

const router = Router();

// /reorder is registered before /:id so it isn't swallowed by the param route.
router.get('/',          categoriesController.list);
router.patch('/reorder', categoriesController.reorder);
router.get('/:id',       categoriesController.getById);
router.post('/',         categoriesController.create);
router.patch('/:id',     categoriesController.update);
router.delete('/:id',    categoriesController.remove);

export default router;
