import { defineTable, string, date } from 'longcelot-sheet-db';

// Server-side revocation list for the JWTs this repo issues — both its own hand-rolled
// signJwt() (middleware/auth.ts) and the ones minted by the three createAuthRouter()
// Google OAuth flows (app.ts). The JWT scheme itself is stateless (no session store),
// so POST /user/auth/logout can't invalidate a token by itself; requireAuth/requireAdmin/
// requireMerchant check every incoming token against this table instead. Stores an HMAC
// hash of the token, not the raw token, so a leaked admin sheet doesn't hand out live
// bearer credentials — mirrors merchant_invites.token_hash / reservation_tokens.token_hash.
export default defineTable({
  name: 'revoked_tokens',
  actor: 'admin',
  timestamps: true,
  columns: {
    token_hash: string().required().unique().primary(),
    user_id:    string().required().ref('users.user_id'),
    // The token's own `exp` claim, if it had one (only Google-OAuth-issued tokens carry
    // one today — see auth.service.ts's logout()). Not read by anything yet; a future
    // cleanup job could use it to drop rows for tokens that would've expired anyway.
    expires_at: date(),
  },
});
