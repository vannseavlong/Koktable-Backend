import { Router } from 'express';
import * as citiesController from '../../controllers/admin/cities.controller';

const router = Router();

// /reorder is registered before /:id so it isn't swallowed by the param route.
router.get('/',          citiesController.list);
router.patch('/reorder', citiesController.reorder);
router.get('/:id',       citiesController.getById);
router.post('/',         citiesController.create);
router.patch('/:id',     citiesController.update);
router.delete('/:id',    citiesController.remove);

export default router;
