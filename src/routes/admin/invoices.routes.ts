import { Router } from 'express';
import * as invoicesController from '../../controllers/admin/invoices.controller';
import { uploadDocument } from '../../middleware/upload';

// Flat resource (not nested under /restaurants/:id like subscriptions/locations) — the
// admin Billing module lists invoices across every restaurant, filterable by
// ?restaurant_id, same shape as GET /admin/users' ?status/?role filters.
const router = Router();

router.get('/',    invoicesController.list);
router.post('/',   invoicesController.create);
// Registered before /:id so "generate" isn't swallowed as an :id param.
router.post('/generate', invoicesController.generate);
router.get('/:id', invoicesController.getById);
router.patch('/:id', invoicesController.update);

router.post('/:id/attachments', uploadDocument.single('file'), invoicesController.addAttachment);
router.delete('/:id/attachments/:attachmentId', invoicesController.deleteAttachment);

export default router;
