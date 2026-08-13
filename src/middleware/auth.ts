import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { adminContext } from '../lib/adapter';
import { logger } from '../lib/logger';

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
  // Only present on tokens minted by the createAuthRouter Google OAuth flows (app.ts) —
  // this repo's own signJwt() below doesn't set one. Read by auth.service.ts's logout()
  // to populate revoked_tokens.expires_at when available.
  exp?:          number;
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

  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as JwtPayload;

  // Only OAuth-issued tokens carry exp (see JwtPayload's doc comment) — this repo's own
  // signJwt() below never sets it, so a password-login token is unaffected by this check.
  if (decoded.exp !== undefined && decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return decoded;
}

export function signJwt(payload: Omit<JwtPayload, 'iat'>): string {
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body    = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
  const sig     = crypto.createHmac('sha256', env.jwtSecret).update(`${header}.${body}`).digest('base64url');

  return `${header}.${body}.${sig}`;
}

// Keyed on the token itself (not its payload) so revoking one token from a user with
// several active sessions doesn't touch the others. HMAC'd rather than stored raw —
// the revoked_tokens sheet shouldn't hold live bearer credentials in plaintext.
export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.jwtSecret).update(token).digest('hex');
}

// Thrown only for an actually-bad token (missing header, bad signature, revoked) —
// deliberately distinct from any other error authenticate() might propagate (e.g. the
// revoked_tokens lookup below failing because Sheets is unreachable or the sheet/tab
// hasn't been synced yet). Only this type should ever produce a 401; anything else is
// a genuine server error and must reach errorHandler as one — collapsing every error
// into "you're unauthorized" would silently lock every signed-in user out during an
// unrelated outage instead of surfacing (and alerting on) a 500.
class AuthError extends Error {}

async function isTokenRevoked(token: string): Promise<boolean> {
  const row = await adminContext().table('revoked_tokens').findOne({ where: { token_hash: hashToken(token) } });
  return row !== null;
}

// Shared by requireAuth/requireAdmin/requireMerchant below: verifies the signature,
// then checks revoked_tokens — a signature-valid token that's been logged out
// (auth.service.ts's logout()) must still be rejected here, since the JWT itself
// carries no server-side session to invalidate any other way.
async function authenticate(req: Request): Promise<JwtPayload> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  let payload: JwtPayload;
  try {
    payload = verifyJwt(token);
  } catch {
    throw new AuthError('Token invalid or expired');
  }

  // Deliberately outside the try/catch above: a failure here (Sheets unreachable,
  // quota, the table not synced yet) is not the same as "this token is bad" and must
  // not be reported as one — see AuthError's doc comment.
  if (await isTokenRevoked(token)) {
    throw new AuthError('Token has been revoked');
  }
  return payload;
}

// AuthError's own message is used verbatim except for the revoked case, which reuses
// the generic "invalid or expired" wording so a logged-out token doesn't read
// differently on the wire than a merely-invalid one.
function unauthorized(req: Request, res: Response, err: AuthError): void {
  const message = err.message === 'Token has been revoked' ? 'Token invalid or expired' : err.message;
  logger.warn('auth_rejected', { path: req.path, method: req.method, reason: err.message });
  res.status(401).json({ error: message });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    req.user = await authenticate(req);
    next();
  } catch (err) {
    if (err instanceof AuthError) unauthorized(req, res, err);
    else next(err);
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    req.user = await authenticate(req);
  } catch (err) {
    if (err instanceof AuthError) unauthorized(req, res, err);
    else next(err);
    return;
  }
  if (req.user.role !== 'admin') {
    logger.warn('auth_forbidden', { path: req.path, method: req.method, user_id: req.user.user_id, role: req.user.role, required: 'admin' });
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

export async function requireMerchant(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    req.user = await authenticate(req);
  } catch (err) {
    if (err instanceof AuthError) unauthorized(req, res, err);
    else next(err);
    return;
  }
  if (req.user.role !== 'merchant') {
    logger.warn('auth_forbidden', { path: req.path, method: req.method, user_id: req.user.user_id, role: req.user.role, required: 'merchant' });
    res.status(403).json({ error: 'Merchant access required' });
    return;
  }
  next();
}
