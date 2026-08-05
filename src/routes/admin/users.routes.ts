import { Router } from 'express';
import * as usersController from '../../controllers/admin/users.controller';

const router = Router();

router.get('/',      usersController.list);
router.get('/:id',   usersController.getById);
router.patch('/:id', usersController.updateStatus);

export default router;
