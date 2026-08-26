import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError';

// Friendlier text for the multer error codes our upload routes can actually hit
// (single/array/fields, 5MB limit — see middleware/upload.ts) — everything else
// falls back to multer's own message.
const MULTER_ERROR_MESSAGES: Partial<Record<string, string>> = {
  LIMIT_FILE_SIZE: 'Image must be 5MB or smaller.',
  LIMIT_FILE_COUNT: 'Too many files in one upload.',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field.',
};

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // Express etags every JSON response by default, including error bodies — without this,
  // a transient 500 gets cached and keeps coming back as a 304 replay of that same stale
  // error on every retry, even once the underlying condition has cleared.
  res.set('Cache-Control', 'no-store');

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  // multer throws its own error class (not AppError) when a file fails validation
  // during the multipart parse — e.g. LIMIT_FILE_SIZE — which happens before any
  // controller runs. Without this, every one of those becomes an opaque 500
  // "Internal server error" instead of a 400 the client can show to the user.
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: MULTER_ERROR_MESSAGES[err.code] ?? err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
