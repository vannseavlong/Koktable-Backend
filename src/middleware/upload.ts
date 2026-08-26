import multer from 'multer';
import { AppError } from '../utils/AppError';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, 'Image must be JPEG, PNG, or WebP.'));
      return;
    }
    cb(null, true);
  },
});

// Separate from `upload` above: invoice attachments are documents (a scanned receipt,
// an invoice PDF), not restaurant imagery — wider mime allowlist, bigger size cap.
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
      cb(new AppError(400, 'Attachment must be PDF, JPEG, PNG, or WebP.'));
      return;
    }
    cb(null, true);
  },
});
