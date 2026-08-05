import crypto from 'crypto';
import { env } from '../config/env';

// Merchant invite tokens: a high-entropy random value emailed to the applicant, with
// only its HMAC-SHA256 hash stored server-side (schemas/admin/merchant_invites.ts) —
// mirrors the HMAC-with-secret pattern already used for JWTs in middleware/auth.ts.
export function generateInviteToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('base64url');
  return { raw, hash: hashInviteToken(raw) };
}

export function hashInviteToken(raw: string): string {
  return crypto.createHmac('sha256', env.inviteTokenSecret).update(raw).digest('hex');
}

// Single-use, expiring: 7 days from issuance. Not worth an env var yet.
export const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
