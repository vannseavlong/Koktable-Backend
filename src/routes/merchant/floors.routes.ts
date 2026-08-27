import { Router } from 'express';
import * as floorsController from '../../controllers/merchant/floors.controller';

const router = Router();

router.get('/',       floorsController.list);
router.get('/:id',    floorsController.getById);
router.post('/',      floorsController.create);
router.patch('/:id',  floorsController.update);
router.delete('/:id', floorsController.remove);

export default router;
