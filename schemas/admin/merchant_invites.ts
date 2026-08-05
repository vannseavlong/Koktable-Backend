import { defineTable, string } from 'longcelot-sheet-db';

// Single-use, expiring invite issued when an admin approves a merchant_applications
// row. token_hash is an HMAC-SHA256 of the raw token (see src/lib/inviteToken.ts) —
// the raw token is only ever emailed to the applicant, never stored or returned by
// the API. expires_at/used_at/revoked_at are ISO datetimes (string, not date() — need
// time precision, not just a calendar day).
export default defineTable({
  name: 'merchant_invites',
  actor: 'admin',
  timestamps: true,
  columns: {
    invite_id:  string().required().unique().primary(),
    restaurant_id:    string().required().ref('restaurants.restaurant_id'),
    email:      string().required(),
    token_hash: string().required().unique(),
    expires_at: string().required(),
    used_at:    string(),
    // Set when POST /admin/merchant-applications/:id/resend-invite supersedes this
    // invite with a fresh one — distinct from used_at so a stale emailed link gets a
    // "check your latest email" message instead of a misleading "already used" one.
    revoked_at: string(),
  },
});
