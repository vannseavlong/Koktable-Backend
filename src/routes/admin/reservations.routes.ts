import { Router } from 'express';
import * as reservationsController from '../../controllers/admin/reservations.controller';

const router = Router();

router.get('/',      reservationsController.list);
router.get('/:id',   reservationsController.getById);
router.patch('/:id', reservationsController.updateStatus);

export default router;
