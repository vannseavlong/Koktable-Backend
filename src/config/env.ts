function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

// .env.example's own placeholder text — long enough (44 chars) to slip past a bare
// length check, so a deploy that copies the example file without editing it would
// otherwise pass validation while every JWT/invite-token signature stays guessable.
const EXAMPLE_PLACEHOLDER = 'change_me_to_a_long_random_string_at_least_32_chars';

// For secrets that sign/hash security-sensitive tokens: presence isn't enough — also
// reject anything short or left as the .env.example placeholder, so a weak/default
// value fails fast at startup instead of quietly shipping.
function requiredSecret(name: string, minLength = 32): string {
  const value = required(name);
  if (value === EXAMPLE_PLACEHOLDER) {
    throw new Error(`${name} is still set to the .env.example placeholder — generate a real secret`);
  }
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters (got ${value.length})`);
  }
  return value;
}

export const env = {
  port:        Number(process.env.PORT ?? 3000),
  nodeEnv:     process.env.NODE_ENV ?? 'development',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  // Admin portal web app — separate from `frontendUrl` above, which is the
  // mobile app's custom URL scheme, not a browser-navigable URL.
  adminFrontendUrl: process.env.ADMIN_FRONTEND_URL ?? 'http://localhost:5173',
  // Merchant-facing web app (invite acceptance page, Phase 3 — not built yet).
  // Only used to build the link embedded in the invite email.
  merchantFrontendUrl: process.env.MERCHANT_FRONTEND_URL ?? 'http://localhost:5174',
  jwtSecret:   requiredSecret('JWT_SECRET'),
  // HMAC key for hashing merchant invite tokens (src/lib/inviteToken.ts) — a real
  // secret, not derived from JWT_SECRET, so leaking one doesn't compromise the other.
  inviteTokenSecret: requiredSecret('INVITE_TOKEN_SECRET'),
  adminSheetId: required('ADMIN_SHEET_ID'),
  google: {
    clientId:     required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    redirectUri:  required('GOOGLE_REDIRECT_URI'),
    // Separate registered redirect URI for the admin portal's Google login
    // (Google redirects wherever the *authorizing request* said to, not
    // wherever the request came in on — so the customer and admin OAuth
    // flows each need their own redirect_uri, both whitelisted in the same
    // Google Cloud OAuth client).
    adminRedirectUri: process.env.GOOGLE_ADMIN_REDIRECT_URI ?? 'http://localhost:3000/admin/auth/callback',
    adminTokens:  process.env.GOOGLE_ADMIN_TOKENS,
  },
  // Optional: sending the merchant invite email is best-effort (see email.service.ts)
  // and simply no-ops with a console warning if these aren't configured.
  emailjs: {
    serviceId:  process.env.EMAILJS_SERVICE_ID,
    templateId: process.env.EMAILJS_TEMPLATE_ID,
    publicKey:  process.env.EMAILJS_PUBLIC_KEY,
    privateKey: process.env.EMAILJS_PRIVATE_KEY,
  },
};
