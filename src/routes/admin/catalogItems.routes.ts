import { Router } from 'express';
import * as catalogItemsController from '../../controllers/admin/catalogItems.controller';

const router = Router();

router.get('/',       catalogItemsController.list);
router.get('/:id',    catalogItemsController.getById);
router.post('/',      catalogItemsController.create);
router.patch('/:id',  catalogItemsController.update);
router.delete('/:id', catalogItemsController.remove);

export default router;
