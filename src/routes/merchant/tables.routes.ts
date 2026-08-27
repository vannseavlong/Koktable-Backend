import { Router } from 'express';
import * as tablesController from '../../controllers/merchant/tables.controller';

const router = Router();

router.get('/',       tablesController.list);
router.get('/:id',    tablesController.getById);
router.post('/',      tablesController.create);
router.patch('/:id',  tablesController.update);
router.delete('/:id', tablesController.remove);

export default router;
