import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

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

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
