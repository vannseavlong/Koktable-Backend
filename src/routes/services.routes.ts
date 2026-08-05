import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import * as servicesController from '../controllers/services.controller';

const router = Router();

// GET / and GET /:id are public — no auth required
router.get('/',    servicesController.list);
router.get('/:id', servicesController.getById);

router.post('/',      requireAdmin, servicesController.create);
router.patch('/:id',  requireAdmin, servicesController.update);
router.delete('/:id', requireAdmin, servicesController.deactivate);

export default router;
