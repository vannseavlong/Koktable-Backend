import { Router } from 'express';
import * as catalogItemsController from '../../controllers/merchant/catalogItems.controller';
import { upload } from '../../middleware/upload';

const router = Router();

router.get('/',       catalogItemsController.list);
router.get('/:id',    catalogItemsController.getById);
router.post('/',      upload.single('image'), catalogItemsController.create);
router.patch('/:id',  upload.single('image'), catalogItemsController.update);
router.delete('/:id', catalogItemsController.remove);

export default router;
