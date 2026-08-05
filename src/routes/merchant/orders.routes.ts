import { Router } from 'express';
import * as ordersController from '../../controllers/merchant/orders.controller';

const router = Router();

router.get('/',      ordersController.list);
router.get('/:id',   ordersController.getById);
router.patch('/:id', ordersController.updateStatus);

export default router;
