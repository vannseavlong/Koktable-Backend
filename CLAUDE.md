# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                    # Install dependencies
pnpm dev                        # Run API with hot reload (tsx watch src/index.ts)
pnpm build                      # Compile TypeScript to dist/
pnpm start                      # Run compiled dist/src/index.js

pnpm db:sync                    # Push local schemas/ to Google Sheets, write .lsdb-tokens.json
pnpm db:status                  # Show schema sync status
pnpm db:validate                # Validate schemas/ against live sheets without writing
pnpm db:seed seeds/admin.ts --skip-existing        # Seed service catalogue into the admin sheet
pnpm db:seed seeds/test-users.ts --skip-existing   # Seed 3 test user accounts (jamie/taylor/morgan @test.local, password Test1234!)
pnpm db:mock-users [count]      # Create N mock user accounts for local testing (default 3, see scripts/mock-users.ts)
pnpm db:backfill-district       # One-time: derive restaurant_locations.district from Places API (needs GOOGLE_PLACES_API_KEY)

pnpm test                       # Run the vitest suite once (test/**/*.test.ts)
pnpm test:watch                 # Same, in watch mode
```

Tests run against an in-memory fake of `longcelot-sheet-db`'s `DatabaseAdapter` interface
(`src/testUtils/fakeAdapter.ts`), swapped in for `src/lib/adapter.ts` via `vi.mock` — no live
Google Sheets access, no real credentials needed. `test/helpers/testApp.ts` mounts the real
route/controller/service/middleware stack directly (not `src/app.ts`'s `createApp()`, which also
wires up the two live-Google-OAuth routers that aren't relevant to route/service-level tests).
There's no lint script configured; `tsc` (via `pnpm build`) is the other static check, alongside
`pnpm test`.

## Architecture

Express API where **Google Sheets is the database**, via the `longcelot-sheet-db` package (published separately; not part of this repo — see "Known upstream bugs" below). There is no ORM/SQL — every read/write goes through a `SheetAdapter` table interface backed by the Sheets API.

```
schemas/            Table definitions (defineTable + column builders from longcelot-sheet-db)
├── admin/          users, credentials, services, schema_versions — live in the one shared admin sheet
└── user/           profile, bookings — live in each user's own per-user sheet

src/
├── lib/adapter.ts       Creates the singleton SheetAdapter, registers all schemas, exports
│                        adminContext() / userContext(userId, actorSheetId) factories
├── config/env.ts        All env var access goes through here (required() throws on startup if missing)
├── routes/              One router per resource, composed in routes/index.ts, mounted at /user in app.ts
├── controllers/         Thin: pull req.user / req.body / req.query, call a service, shape the res.json()
├── services/            All business logic + validation + SheetAdapter calls live here
├── middleware/auth.ts    requireAuth / requireAdmin / requireMerchant populate req.user from a
│                        hand-rolled HMAC-SHA256 JWT (no external JWT library — verifyJwt/signJwt
│                        implement the whole thing) and reject a token found in `revoked_tokens`
│                        (async now, for that Sheets lookup — see Auth section below)
├── middleware/errorHandler.ts   Catches AppError → { error, details? } with err.statusCode; anything
│                        else → 500 (asyncHandler.ts routes thrown/rejected errors here)
└── utils/AppError.ts    The only error type services should throw (statusCode, message, details?)
```

### The actor model (core concept)

Every table declares `actor: 'admin' | 'user'` in its schema. This determines **which physical Google Sheet** a table's rows live in:

- `admin` tables (`users`, `credentials`, `services`, `schema_versions`) live in the single sheet at `ADMIN_SHEET_ID` — shared across all users.
- `user` tables (`profile`, `bookings`) live in a **separate Google Sheet per user**, created by `adapter.createUserSheet(userId, role, email, { extraFields })` at registration time. Its ID is stored as `actor_sheet_id` on the user's row in the admin `users` table and embedded in their JWT payload.

Get the right context before calling `.table()`:
- `adminContext()` — for admin-table reads/writes (defined in `src/lib/adapter.ts`)
- `userContext(userId, actorSheetId)` — for a specific user's per-user tables; `actorSheetId` comes from `req.user!.actor_sheet_id` (see `requireActorSheet()` in `bookings.service.ts`)

A request with no `actor_sheet_id` on its JWT (e.g. a user record created before a sheet existed) can't touch user-actor tables — services throw `AppError(422, ...)` in that case rather than crashing.

### Request flow

`routes/*.routes.ts` (mounts `requireAuth`/`requireAdmin`/`requireMerchant` from `middleware/auth.ts`) → `controllers/*.controller.ts` (wrapped in `asyncHandler`, thin) → `services/*.service.ts` (validation, `adminContext()`/`userContext()`, business rules, throws `AppError`) → `SheetAdapter.table(name).find/create/update(...)`.

### Auth

Four parallel flows converge on the same hand-rolled JWT (`middleware/auth.ts`, HMAC-SHA256, no library):
- Email/password: `POST /user/auth/register` and `/login` in `auth.service.ts`, using `hashPassword`/`comparePassword`/`validatePasswordStrength` from `longcelot-sheet-db`. Password hashes live in the separate `credentials` admin table, never on `users`.
- Customer Google OAuth (mobile): `createAuthRouter(...)` from `longcelot-sheet-db`, `registrationPolicy: 'open'` (mounted directly on `/user` in `app.ts`, bypassing this repo's own route layer) drives the `/user/auth/google` → `/user/auth/callback` redirect flow; `handleGoogleProfile` in `auth.service.ts` is the `onUser` callback, finding-or-creating the user row. Redirects to `FRONTEND_URL`, the mobile app's custom URL scheme — not a browser-navigable URL, so it can't serve the Web client below.
- Customer Google OAuth (Web): a **third** `createAuthRouter(...)` instance mounted on `/user/web` (`/user/web/auth/google` → `/user/web/auth/callback`), same `registrationPolicy: 'open'`/`handleGoogleProfile` as the mobile flow above (both create/look up the same customer account) but its own `oauthConfig.redirectUri` (`GOOGLE_WEB_REDIRECT_URI`) and redirects to `WEB_FRONTEND_URL` — see `WEB_API_GUIDE.md`. Mounted on a distinct path from the mobile router so their `/auth/google` routes don't collide.
- Admin Google OAuth: a separate `createAuthRouter(...)` instance mounted on `/admin` (`/admin/auth/google` → `/admin/auth/callback`), `registrationPolicy: 'login-only'` plus `handleAdminGoogleProfile` additionally requiring `role === 'admin'` — no self-registration, and an existing customer account can't get in here even with a valid Google login. Uses its own `oauthConfig.redirectUri` (`GOOGLE_ADMIN_REDIRECT_URI`) and redirects to `ADMIN_FRONTEND_URL`, not `FRONTEND_URL` — see `ADMIN_API.md`. All three Google OAuth routers share one Google Cloud OAuth client; each redirect URI (`GOOGLE_REDIRECT_URI`, `GOOGLE_WEB_REDIRECT_URI`, `GOOGLE_ADMIN_REDIRECT_URI`) must be registered there as an *additional* authorized redirect URI.

All four paths converge on `signJwt`; the three Google flows additionally go through `createUserSheet()` (customer paths only — admins are seeded directly into the shared admin sheet, they never get a per-user sheet).

**Logout / revocation:** the JWT scheme above is otherwise stateless (no session store), so `POST /user/auth/logout` (`requireAuth`-guarded) can't invalidate a token by itself — it writes an HMAC hash of the presented token to the `revoked_tokens` admin table (`schemas/admin/revoked_tokens.ts`) instead. `requireAuth`/`requireAdmin`/`requireMerchant` now check every incoming token against that table (hence async — each authenticated request does one Sheets `findOne`, mitigated by lsdb's 2s read cache) and reject it with the same generic `401` a bad-signature token gets, whether it came from the email/password flow or any of the three Google routers above. `verifyJwt`/`requireAuth` still don't read or enforce the `exp` claim on OAuth-issued tokens (see the `longcelot-sheet-db` section below) — revocation is the only way a token stops working before the client itself discards it.

### Adding a resource

Adding a new table/resource generally touches, in order: a schema file under `schemas/{admin,user}/`, registering it in the array in `src/lib/adapter.ts`, a service in `src/services/`, a controller in `src/controllers/`, a route file wired into `src/routes/index.ts`.

## Environment

All required env vars are validated eagerly in `src/config/env.ts` (throws on missing at import time, before the server starts). See `.env.example` for the full list and Google Cloud Console setup notes (Sheets API + Drive API must be enabled, redirect URI must match exactly).

`GOOGLE_ADMIN_TOKENS` vs `.lsdb-tokens.json` (`src/lib/adapter.ts`): locally, OAuth tokens from `pnpm db:sync` are cached to the gitignored `.lsdb-tokens.json` (the pre-0.1.26 `.sheet-db-tokens.json` filename is read as a fallback for older checkouts). In production (no persistent filesystem), paste that file's contents as the single-line `GOOGLE_ADMIN_TOKENS` env var instead — checked first, before falling back to the file.

## `longcelot-sheet-db` dependency

On `^0.1.41` (upgraded from `0.1.18` — see `CHANGELOG.md` in the package for the full history). Things worth knowing when bumping this dependency further:

- **`createUserSheet(userId, role, email, options?)`** — the 4th param became an options object in 0.1.19 (`{ extraFields?, actorTokens? }`), breaking the old bare-`extraFields` call signature. All three call sites in this repo (`auth.service.ts` ×2, `scripts/mock-users.ts`) already use the new shape — don't revert to passing `extraFields` directly as the 4th arg.
- **`role` → `actor`** on `withContext()` (0.1.21) and **`ActorConfig.role` → `.name`** in `lsdb.config.ts` (0.1.22) — old field names still work via deprecated aliases but this repo has been migrated to the new names (`adminContext()`/`userContext()` in `adapter.ts`, `lsdb.config.ts`). Don't confuse this with the `role` column on the `users` **table** itself (`'user' | 'admin'` RBAC value in `schemas/admin/users.ts` / seeds) — that's an unrelated, still-current field.
- **CLI renamed `sheet-db` → `lsdb`** (0.1.26); config file `sheet-db.config.ts` → `lsdb.config.ts`; token file `.sheet-db-tokens.json` → `.lsdb-tokens.json`. `package.json`'s `db:*` scripts and this repo's config/token filenames have been updated to match.
- **In-memory read cache** (0.1.28, 2s TTL by default) and **numeric `orderBy` sorting** (0.1.25) landed since 0.1.18 — no code changes needed here, but relevant if debugging read-after-write staleness or a sort that looks lexicographic.
- **`DriveStorageAdapter.upload()` now returns a directly-renderable URL** (0.1.40) — `drive.google.com/thumbnail?id=…` for images, `/file/d/…/preview` for video, `/file/d/…/view` otherwise — instead of the old `uc?id=` download-endpoint link. Nothing in this repo parsed the old format, so this was a no-op on upgrade; new uploads just get the new URL shape. `delete()`/`deleteFile()` accept either format.
- **`createAuthRouter`-issued JWTs now default to a 1-day `exp` claim** (0.1.41, part of an OWASP Top 10 pass — see the package's `OWASP-TOP-10.md`), plus OAuth-flow CSRF protection (`state` param) and a new exported `verifyJwt(token, secret)` to check it. **This repo's own `middleware/auth.ts` `verifyJwt`/`requireAuth` still don't read or enforce `exp`** — tokens from both Google OAuth routers in `app.ts` and from this repo's own `signJwt()` (email/password path) keep working indefinitely regardless of the claim, same as before the bump. Adopting real expiry (and the package's `verifyJwt`) would be a deliberate follow-up, not something the version bump did for us.
- **`hashPassword()`/`validatePasswordStrength()` (0.1.41) reject passwords over bcrypt's 72-byte limit** instead of silently truncating — both call sites in this repo (`auth.service.ts`, `merchant.service.ts`) already check `validatePasswordStrength(...).valid` before hashing and surface `.errors`, so this is a no-op on upgrade, just stricter.
- `bug-report.md` in this repo documents the three bugs (against v0.1.17) that motivated the original `mock-users.ts` workaround — all three were fixed upstream in 0.1.18 and remain fixed; the workaround (building an admin-context adapter manually instead of shelling out to the CLI) is kept regardless since it's simpler than invoking `lsdb mock-users` as a subprocess.

## DB_DRIVER / Postgres cutover

`DB_DRIVER` (`config/env.ts`, validated eagerly like everything else there) is `'sheets'`
(default) or `'postgres'`. Only `'sheets'` actually works today — `'postgres'` is a real,
validated value that makes `src/lib/adapter.ts` throw a clear "not usable yet" error at
startup instead of half-working. See the large comment block at the top of that file for
the three concrete gaps blocking a real cutover (Google OAuth routers still typed to the
concrete `SheetAdapter`, `createDatabaseAdapter()`'s TS return type not exposing
`registerSchemas()`, and `createUserSheet()` having no SQL-adapter equivalent).

This isn't a from-scratch project, though: `longcelot-sheet-db@0.1.41` (already the
installed version here) ships `createDatabaseAdapter()` — a factory that reads `$DB_DRIVER`
itself and returns a Sheets/Postgres/MySQL-backed adapter behind the identical
`DatabaseAdapter`/`TableOperations` contract — plus first-party CLI tooling to actually
apply this repo's `schemas/` to a live database:

- `lsdb migrate --sql --apply --connection-string $DATABASE_URL --driver postgres` — applies `schemas/` as real DDL (`CREATE TABLE`, `UNIQUE`, `CHECK` for `enum()`, indexes for `index()` columns, FK-dependency-ordered). Idempotent, safe to rerun.
- `lsdb migrate-data --run --connection-string $DATABASE_URL --driver postgres --all-users` — the one-time Sheets → Postgres row-data cutover, upserting by `_id`.
- Both auto-handle Render/Heroku/Supabase's required SSL for any non-localhost `connectionString`.

The package's own `CHANGELOG.md` documents a prior real production cutover done this exact
way ("F2 Render Postgres data cutover") — worth reading before attempting this repo's own
cutover, several non-obvious bugs (FK ordering, soft-deleted row exclusion, readonly-column
upserts) were found and fixed there.

## Related project

`WEB_API_GUIDE.md` in this repo is the API reference written for the web booking client (endpoint shapes, TypeScript snippets) — update it when changing request/response shapes.
