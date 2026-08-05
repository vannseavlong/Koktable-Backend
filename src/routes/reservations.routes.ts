import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import * as reservationsController from '../controllers/reservations.controller';

const router = Router();

// All reservation routes require authentication
router.use(requireAuth);

router.post('/',   reservationsController.create);
router.get('/',    reservationsController.list);
router.get('/active', reservationsController.listActive);
router.get('/:id', reservationsController.getById);
router.patch('/:id', reservationsController.update);

export default router;
