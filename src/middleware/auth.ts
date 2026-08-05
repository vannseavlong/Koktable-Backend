import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';

export interface JwtPayload {
  user_id:       string;
  email:         string;
  full_name:     string;
  role:          string;
  actor_sheet_id?: string;
  // Set only for role: 'merchant' — the restaurant they own (restaurants.owner_user_id === user_id),
  // resolved at login/invite-accept time. Merchants never get a per-user actor sheet.
  restaurant_id?:      string;
  iat:           number;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function verifyJwt(token: string): JwtPayload {
  const [header, payload, sig] = token.split('.');
  if (!header || !payload || !sig) throw new Error('Malformed token');

  const expected = crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  if (sig !== expected) throw new Error('Invalid token signature');

  return JSON.parse(Buffer.from(payload, 'base64url').toString()) as JwtPayload;
}

export function signJwt(payload: Omit<JwtPayload, 'iat'>): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const sig     = crypto.createHmac('sha256', env.jwtSecret).update(`${header}.${body}`).digest('base64url');

  return `${header}.${body}.${sig}`;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  try {
    req.user = verifyJwt(authHeader.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  });
}

export function requireMerchant(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'merchant') {
      res.status(403).json({ error: 'Merchant access required' });
      return;
    }
    next();
  });
}
