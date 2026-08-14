# Security Checklist — OWASP Top 10:2025 (Backend)

Baseline audit of the Express API against the [OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/).
Checked items are already true of this codebase as of 2026-08-13; unchecked items are gaps to close, worked one at a time.

## A01:2025 — Broken Access Control
(now folds in SSRF)
- [x] Every non-public route goes through `requireAuth` / `requireAdmin` / `requireMerchant` (`middleware/auth.ts`)
- [x] Per-user data lives in a separate Google Sheet (`actor_sheet_id`), not row-filtered from a shared table — structurally prevents cross-user IDOR on `user`-actor tables
- [ ] Audit every service method that takes an ID from `req.params`/`req.body` for ownership checks (e.g. can merchant A act on restaurant B's data via `restaurant_id` spoofing in the body?)
- [ ] Audit for SSRF: any server-side fetch of a user-supplied URL (image URLs, webhook-style callbacks) — none known today, confirm and document
- [x] CORS origin list (`app.ts`) driven entirely by env vars — confirmed no `*`/permissive fallback; unset env vars fall back to `localhost` dev URLs, not a wildcard, so a misconfigured prod deploy fails closed (blocks real origins) rather than opening up

## A02:2025 — Security Misconfiguration
- [x] `src/config/env.ts` validates all required env vars eagerly at startup (fail fast, no silent defaults for secrets)
- [x] `helmet()` wired into `app.ts` (sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS when over TLS, etc.)
- [x] `app.disable('x-powered-by')` in `app.ts`
- [ ] Confirm prod deploy terminates TLS and sets HSTS (may live at the hosting/proxy layer, not Express — verify either way; helmet's HSTS header is a no-op over plain HTTP)
- [x] `errorHandler.ts` — confirmed: non-`AppError` errors always return the generic `{ error: 'Internal server error' }`, never the caught error's message/stack

## A03:2025 — Software Supply Chain Failures
- [x] `.github/workflows/ci.yml` added — runs `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test` on push/PR to `main`
- [x] `pnpm audit --audit-level=high` added to CI, `continue-on-error: true` (non-blocking) so a transitive advisory with no available fix doesn't gate every PR — surfaced in the job log for manual review instead
- [ ] `longcelot-sheet-db` installs like any other npm dependency (ordinary semver range in `package.json`, standard registry resolution + sha512 integrity in `pnpm-lock.yaml`) — but it's a single-maintainer, low-adoption first-party package, not a widely-vetted one like `express`/`helmet`. Confirm how its releases are verified (npm account 2FA, provenance/signing, anything beyond one person running `npm publish`) before bumping — see CLAUDE.md's `longcelot-sheet-db dependency` section for upgrade history
- [x] `pnpm-lock.yaml` committed and CI installs with `--frozen-lockfile`

## A04:2025 — Cryptographic Failures
- [x] Passwords hashed via `longcelot-sheet-db`'s `hashPassword` (bcrypt) + `validatePasswordStrength`, never stored/logged in plaintext
- [x] Password hashes live in a separate `credentials` table from `users`, not colocated with profile data
- [x] Bearer tokens hashed (HMAC) before being written to `revoked_tokens`, never stored raw
- [x] `verifyJwt` now rejects a token whose `exp` claim, if present, is in the past — covers OAuth-issued tokens. This repo's own `signJwt` (email/password login) still never sets `exp`, so those tokens remain non-expiring by design (unchanged) until explicitly revoked
- [ ] Confirm `JWT_SECRET` (and Google OAuth client secret) have adequate entropy and are rotated out of any historical `.env` commits

## A05:2025 — Injection
- [x] No raw SQL / string-built queries — all data access goes through the `SheetAdapter` table interface
- [x] Added `utils/sheetSanitize.ts` (`sanitizeCell`), prefixing `=`/`+`/`-`/`@`-leading values with `'` before they reach a sheet write. Applied at the two highest-traffic free-text-into-Sheets points: `reservations.service.ts` (`guest_name`, `notes` on create and update) and `merchant/restaurant.service.ts` (`name`/`name_zh`/`name_km`/`name_ko`/`description*` on `updateOwn`). Not applied repo-wide — other free-text fields (e.g. `profile.full_name`, admin-authored fields) are lower-exposure and left uncovered; broader service-layer validation consistency is still open below
- [ ] Audit service-layer input validation for consistency — validation today is ad hoc per service (no shared schema library like `zod`)
- [ ] Confirm `multer` upload path (`middleware/upload.ts`) doesn't trust client-supplied filenames when persisting/naming Drive uploads

## A06:2025 — Insecure Design
- [x] `loginLimiter` (15 min / 10 requests) and `registerLimiter` (60 min / 10 requests) added to `POST /user/auth/login` and `/register` (`routes/auth.routes.ts`), same `express-rate-limit` pattern as `resendInviteLimiter`/`applyLimiter`
- [ ] No account lockout / backoff after repeated failed logins — out of scope for this pass (rate limiting above mitigates but doesn't replace this); would need per-account state, not just per-IP
- [ ] No CAPTCHA or equivalent on public registration — out of scope for this pass
- [x] Password strength enforced server-side via `validatePasswordStrength` before hashing

## A07:2025 — Authentication Failures
(renamed from Identification and Authentication Failures)
- [x] Logout is real revocation (HMAC'd token written to `revoked_tokens`, checked on every authenticated request), not just a client-side clear
- [x] `isTokenRevoked` failures (Sheets outage) fail closed as a 500, not silently treated as "not revoked" (see `AuthError` doc comment in `auth.ts`)
- [x] Token expiry now enforced when the `exp` claim is present (see A04 above)
- [ ] No refresh-token pattern — a single long-lived bearer token is the only session artifact. Out of scope: a real fix here is a refresh-token redesign, deliberately not attempted in this pass. Moving off bearer tokens to httpOnly cookies was considered but is a cross-repo contract change (Portal/Web both read the token from the response body and send it as a header) — flagged, not implemented
- [ ] No MFA option for admin/merchant roles (highest-value accounts) — out of scope for this pass
- [ ] No password-reset flow found in `services/` — confirmed intentional: no such feature exists yet. Building one is a new feature, not a hardening fix, so out of scope here

## A08:2025 — Software or Data Integrity Failures
- [x] Upload `fileFilter` restricts MIME type to `image/jpeg|png|webp` and caps size at 5MB (`middleware/upload.ts`)
- [ ] No integrity check between `schemas/` and the live Google Sheet beyond `pnpm db:validate` — confirm it's actually run before deploys, not just available
- [ ] No signed/verified build artifact step (CI gap, ties into A03)

## A09:2025 — Security Logging & Alerting Failures
- [x] `lib/logger.ts` — minimal structured JSON logger (no external dependency), plus `middleware/requestLogger.ts` logging one line per request (method/path/status/duration)
- [x] Security-relevant events now logged: failed login/register (`auth.service.ts`, with reason — unknown email, bad password, weak password, duplicate email, inactive account), token revocation on logout, auth rejections (401 invalid/expired/revoked token, 403 wrong-role) in `middleware/auth.ts`
- [ ] No alerting on repeated auth failures, 401 spikes, or 500 spikes — out of scope; would need a log sink/alerting system beyond console output
- [x] Minimal logging story decided: structured console JSON only, no external shipping — matches this repo's no-persistent-filesystem prod deploy

## A10:2025 — Mishandling of Exceptional Conditions
(new category)
- [x] Centralized `errorHandler.ts`: `AppError` → `{ error, details? }` with its `statusCode`; anything else → generic 500 (no leakage by default)
- [x] `asyncHandler.ts` routes thrown/rejected errors into that handler — no unhandled-rejection crashes from route handlers
- [x] Auth layer explicitly distinguishes "bad token" (401) from "infra failure while checking the token" (500) rather than collapsing both into a lockout (see `AuthError` doc comment)
- [ ] Audit services for the same fail-closed-vs-fail-open discipline outside of auth (e.g. does a Sheets outage mid-booking leave partial state?)
