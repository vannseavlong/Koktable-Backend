import { Router } from 'express';
import * as reservationsController from '../../controllers/admin/reservations.controller';
import * as reservationForwardsController from '../../controllers/admin/reservationForwards.controller';

const router = Router();

router.get('/',      reservationsController.list);
router.get('/:id',   reservationsController.getById);
router.patch('/:id', reservationsController.updateStatus);

router.get('/:id/forwards',  reservationForwardsController.list);
router.post('/:id/forwards', reservationForwardsController.create);

export default router;
