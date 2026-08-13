import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    logger.info('http_request', {
      method:      req.method,
      path:        req.path,
      status:      res.statusCode,
      duration_ms: Date.now() - start,
    });
  });
  next();
}
