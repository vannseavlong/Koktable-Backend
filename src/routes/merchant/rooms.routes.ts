import { Router } from 'express';
import * as roomsController from '../../controllers/merchant/rooms.controller';

const router = Router();

router.get('/',       roomsController.list);
router.get('/:id',    roomsController.getById);
router.post('/',      roomsController.create);
router.patch('/:id',  roomsController.update);
router.delete('/:id', roomsController.remove);

export default router;
