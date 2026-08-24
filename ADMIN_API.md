# Restaurant — Admin API Summary

Backend base URL: `http://localhost:3000` (dev) / production URL (prod).

All routes below are mounted under the `/admin` prefix — e.g. `GET /admin/reservations`,
not `GET /reservations`. Every route requires:
```
Authorization: Bearer <jwt_token>
```
where the JWT belongs to a `users` row with `role: "admin"` (returned by `POST /user/auth/login`,
see `WEB_API_GUIDE.md` for the auth contract — it's the same login endpoint, just a different
account role). Non-admin tokens get `403 { "error": "Admin access required" }`.

### Getting an admin account

There's no signup flow for admins. Seed one locally:
```bash
# .env: SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
pnpm db:seed seeds/super-admin.ts --skip-existing
```
Then log in exactly like a regular user: `POST /user/auth/login` with that email/password.

### Signing in with Google instead

| Method | Endpoint | Behavior |
|--------|----------|----------|
| GET | `/admin/auth/google` | Redirects to the Google OAuth consent screen |
| GET | `/admin/auth/callback` | OAuth callback; redirects to `ADMIN_FRONTEND_URL?token=<jwt>` |

This is a **separate, admin-only** OAuth flow from the mobile app's `/user/auth/google` —
different route, different `redirect_uri` (`GOOGLE_ADMIN_REDIRECT_URI`, must be added as an
*additional* authorized redirect URI on the same Google Cloud OAuth client, not a replacement
for the customer one), and `registrationPolicy: 'login-only'`: an unrecognized Google account
gets `401`, full stop — there is no self-registration path here. On top of that, the account
must already have `role: "admin"` in the `users` table; a valid Google login for an existing
*customer* account is also rejected (`401`) at this endpoint specifically, even though the same
account can sign in fine via `/user/auth/google`. In other words: to enable Google sign-in for a
given admin, that person's `email` must already exist as an admin-role row in `users` — either
seeded directly or promoted from an existing account — before they can use this button.

### Error shape (all endpoints)
```json
{ "error": "Human-readable message", "details": ["optional", "validation", "errors"] }
```
Status codes: `400` bad input · `401` unauthenticated · `403` not an admin · `404` not found · `409` conflict

---

## 1. Users — `/admin/users`

Read-only account list, plus suspending/reactivating an account. Does not manage `role` (there's
no endpoint to promote a user to admin — do that via a seed/script, not this API).

| Method | Endpoint | Query / Body | Response |
|--------|----------|---------------|----------|
| GET | `/admin/users` | `?status=&role=&search=&limit=&offset=` | `{ users: User[], total, limit, offset }` |
| GET | `/admin/users/:id` | — | `{ user: User }` |
| PATCH | `/admin/users/:id` | `{ status: "active" \| "inactive" }` | `{ user: User }` |

`search` matches (case-insensitive, substring) against `email` and `full_name`; it's applied
client-side after fetching the admin sheet, so it isn't fast at very large user counts.

`User` object: `{ user_id, email, full_name, picture, role, auth_provider, actor_sheet_id, status }`
(same shape as `/user/auth/me`, minus nothing — no password fields ever appear here, those live
in the separate `credentials` table).

Setting `status: "inactive"` blocks login on all three auth paths:
- `POST /user/auth/login` (email/password) → `403 { error: "This account has been deactivated. Contact an admin." }`.
- Customer Google OAuth (`/user/auth/google` → `/user/auth/callback`) → the callback's `onUser` throws,
  which `createAuthRouter` surfaces as a `500 { error: "onUser callback threw: ..." }`. This is a
  limitation of the upstream router: its `registrationPolicy: 'open'` treats a `null` return from
  `onUser` as "unknown user, auto-provision one" rather than "reject", so throwing is the only way to
  actually block a known-but-inactive account on this path — a `403` isn't available here.
- Admin Google OAuth (`/admin/auth/google` → `/admin/auth/callback`) → `onUser` returns `null` (same
  as an unrecognized or non-admin account), surfaced by the `login-only` router as
  `401 { error: "Access denied: ... is not an authorised user. Contact an admin." }`.

An already-issued JWT for a user later marked inactive is **not** revoked — the JWT is stateless and
`requireAuth`/`requireAdmin` don't hit the `users` table per-request, so inactive only blocks new logins,
not existing sessions.

---

## 2. Services (content catalogue) — `/admin/services`

Full CRUD over the same `services` table the mobile app reads from `GET /user/services` — but
unlike that public endpoint, this one returns **every** service regardless of `active`, unsorted
by anything but the explicit query below.

| Method | Endpoint | Body | Response |
|--------|----------|------|----------|
| GET | `/admin/services` | `?active=true\|false&category_id=` | `{ services: Service[] }` (sorted by `sort_order` asc) |
| GET | `/admin/services/:id` | — | `{ service: Service }` |
| POST | `/admin/services` | see below | `{ service: Service }` (201) |
| PATCH | `/admin/services/:id` | any subset of create fields | `{ service: Service }` |
| DELETE | `/admin/services/:id` | — | `204 No Content` (hard delete — see note below) |
| PATCH | `/admin/services/reorder` | `{ order: string[] }` (service_ids, desired order) | `{ services: Service[] }` |

### Create/update body
```json
{
  "name":        "Chef's Tasting Menu",
  "description": "A multi-course seasonal tasting menu, reserved in advance.",
  "price_from":  25,
  "icon":        "restaurant_menu",
  "color":       "#D6EAE4",
  "category_id": "cat_fine_dining",
  "active":      true,
  "sort_order":  1
}
```
`name`, `price_from` (>= 0), `icon`, `color`, `category_id` are required on **create**; PATCH accepts
any subset. `description`/`active`/`sort_order` default to `''`/`true`/`0` when omitted on create.

### Service object (response)
```json
{
  "service_id":  "svc_tasting_menu",
  "name":        "Chef's Tasting Menu",
  "description": "A multi-course seasonal tasting menu, reserved in advance.",
  "price_from":  25,
  "icon":        "restaurant_menu",
  "color":       "#D6EAE4",
  "category_id": "cat_fine_dining",
  "active":      true,
  "sort_order":  1
}
```

**Deleting a service is a hard delete** (the `services` schema has no `softDelete`). Existing
reservations that reference a deleted `service_id` are unaffected — `reservations.service_name` is
denormalized at creation time — but the catalogue entry is gone for good. Prefer `PATCH { active: false }`
over `DELETE` unless you actually want to remove the row.

`PATCH /admin/services/reorder` rewrites `sort_order` to each id's index in the given array (issues
one `update()` per id — fine at catalogue scale, not built for hundreds of rows).

---

## 3. Reservations (orders) — `/admin/reservations`

Cross-user view of every reservation. Reservations live in each user's own per-user sheet (`actor: 'user'`
in the schema), so this endpoint fans out to every registered user's sheet and merges the results —
there is no single "all reservations" table. Fine at this product's scale; would need a denormalized
index at high user counts.

| Method | Endpoint | Query / Body | Response |
|--------|----------|---------------|----------|
| GET | `/admin/reservations` | `?status=&restaurant_id=&limit=&offset=` | `{ reservations: AdminReservation[], total, limit, offset }` |
| GET | `/admin/reservations/:id` | `?user_id=` (**required**) | `{ reservation: AdminReservation }` |
| PATCH | `/admin/reservations/:id` | `{ user_id, status }` (**both required**) | `{ reservation: AdminReservation }` |

`restaurant_id` is a multi-store-pivot column (see `schemas/user/reservations.ts`), filterable here. It's
populated only for reservations created via `POST /user/reservations` with `item_id` (a restaurant-scoped
`catalog_items` row — see "Catalog Items" below); reservations created the legacy way, with
`service_id` against the single-restaurant `services` table, keep `restaurant_id` blank. The mobile app
doesn't send `item_id` yet (Phase 4 of the pivot), so in practice `?restaurant_id=` won't match
anything until then — the API support is ready ahead of that client work.

`user_id` is required on the single-reservation routes because it's what tells the server which user's
sheet to read — the list response already includes it on every row, so the admin UI should carry it
forward from there (e.g. as a hidden field alongside the reservation id, not just the id alone).

### AdminReservation object (response)
Same shape as the user-facing `ReservationModel` in `WEB_API_GUIDE.md`, plus three owner fields:
```json
{
  "reservation_id":   "rsv_sjK8C8N7qc",
  "guest_name":     "Alex Tran",
  "party_size":     2,
  "service_id":   "svc_tasting_menu",
  "service_name": "Chef's Tasting Menu",
  "start_date":   "2026-06-12",
  "end_date":     "2026-06-16",
  "daily_rate":   25,
  "notes":        "Window seat preferred",
  "status":       "pending",
  "restaurant_id":      "",
  "nights":       4,
  "total":        100,
  "user_id":      "u_8x7k2m1qzr",
  "user_name":    "Jamie Rivera",
  "user_email":   "jamie@test.local"
}
```

### Status transitions (admin-only)
```
pending → confirmed → active → completed
   └────────┴───────────┴──────→ cancelled   (from any non-terminal state)
```
`completed` and `cancelled` are terminal — any other transition attempt returns `409` with the
current and attempted status in the message. This is exactly the admin-side transition
`WEB_API_GUIDE.md` notes isn't exposed on the user-facing `PATCH /user/reservations/:id` (which only
allows `notes` and self-service `cancelled`).

`GET /admin/reservations` has no server-side sort override — results are always newest-first by
`_created_at` across the merged set. Pagination (`limit`/`offset`) is applied **after** merging
and sorting, not per-user, so page boundaries are stable across requests.

---

## 4. Merchant Applications — `/admin/merchant-applications`

Review queue for the public restaurant-owner applications submitted at `POST /merchant/apply` (see
"Merchant onboarding (public)" below). Approving generates a restaurant + a single-use invite and
(best-effort) emails it to the applicant; rejecting just records a reason.

| Method | Endpoint | Query / Body | Response |
|--------|----------|---------------|----------|
| GET | `/admin/merchant-applications` | `?status=` | `{ applications: MerchantApplication[] }` |
| GET | `/admin/merchant-applications/:id` | — | `{ application: MerchantApplication }` |
| POST | `/admin/merchant-applications/:id/approve` | — | `{ application, restaurant, invite: { expires_at } }` |
| POST | `/admin/merchant-applications/:id/reject` | `{ reason? }` | `{ application: MerchantApplication }` |
| POST | `/admin/merchant-applications/:id/resend-invite` | — | `{ application, restaurant, invite: { expires_at } }` |

Approve/reject `409` if the application isn't currently `pending` (no re-approving/re-rejecting —
re-approving would create a second `restaurants` row for the same application, since `approve()` isn't
idempotent).

### Resending an invite
If the applicant's invite email never arrives (EmailJS misconfigured, spam-filtered, link
expired before they got to it, etc.), use `POST /admin/merchant-applications/:id/resend-invite`
— same response shape as approve.

- `409` if the application isn't `approved` (nothing to resend for a still-`pending` or
  `rejected` application — approve it first).
- `404` if no `restaurants` row is linked to this application (shouldn't happen for anything approved
  after this endpoint shipped — `approve()` sets `restaurants.application_id`; older pre-existing restaurants
  created before that column existed won't have it backfilled — see below).
- `409` if the restaurant's `status` isn't `pending` — `active` means the merchant already redeemed an
  invite (nothing left to resend), `suspended` means an admin already dealt with this restaurant for
  other reasons.
- On success: every currently live (not used, not already revoked) invite for that restaurant is
  marked `revoked_at` — so an old copy of a previous invite email, if the applicant still has it,
  now 400s with a "check your latest email" message instead of "already used" — then a fresh
  token is generated, emailed, and returned (same `invite: { expires_at }` shape as approve,
  same rate limit tier as `/merchant/invite/:token` below: 20/15min/IP, since this also triggers
  a real EmailJS send and a real credential issuance despite sitting behind `requireAdmin`).

**`approve()` is now idempotent per `application_id`.** Historically, the only workaround for a
failed invite email was manually flipping the application's `status` back to `pending` in the
Sheet and re-approving — which created a second `restaurants` row every time (this product had six
`restaurants` rows for one merchant applicant before this endpoint existed). `approve()` now looks for
an existing `restaurants` row linked via `application_id` first; if one exists, it reuses it (revoking
that restaurant's live invites and issuing a fresh one, same as resend-invite) instead of creating a
duplicate. The whole handler is also serialized per `application_id` (`src/lib/mutex.ts`, same
pattern as the invite-redemption lock above) so two near-simultaneous approve requests — a
double-click, a client retry after a slow response — can't both race past the pending-status
check and each create their own restaurant. **Pre-existing duplicate `restaurants` rows from before this
fix are not automatically cleaned up or backfilled** — only the most-recently-created restaurant for a
given applicant can be retroactively linked with confidence; older orphaned duplicates (and
their still-technically-redeemable invites) need a manual per-case decision, not an automated
migration.

### MerchantApplication object
```json
{
  "application_id":   "app_x8k2m1qzrp",
  "restaurant_name":        "The Golden Fork",
  "applicant_name":   "Sam Rivera",
  "contact_email":    "sam@goldenfork.example",
  "contact_phone":    "+1 555 0100",
  "description":      "Contemporary fine dining, serving the north side.",
  "status":           "pending",
  "rejection_reason": ""
}
```
`POST /merchant/apply` rejects (`409`) a new submission if a `pending` application already exists
for the same `contact_email` — resubmit after the existing one is approved/rejected, not before.

### Approve response — `invite.expires_at` only
The raw invite token is **never** returned by this endpoint or stored anywhere — it only ever
appears in the emailed link (`${MERCHANT_FRONTEND_URL}/invite/<token>`) and, in non-production, in
the server console log (`email.service.ts`), so the flow is testable without real EmailJS
credentials configured. Email delivery itself is best-effort: a failed/unconfigured EmailJS send
does **not** fail the approve request — the restaurant and invite are already committed by that point.

**Known gap:** the invite-accept flow (`POST /merchant/invite/:token`, below) is password-only.
The TODO's "or activate via Google OAuth" option is deferred — the upstream `createAuthRouter`
package has no way to carry the invite token through the OAuth redirect round-trip (no custom
`state` support), so supporting it needs a session/cookie mechanism this stateless-JWT codebase
doesn't have yet.

---

## 5. Restaurants — `/admin/restaurants`

Read-only-ish visibility into restaurants (created only via the approve flow above, never directly).

| Method | Endpoint | Query / Body | Response |
|--------|----------|---------------|----------|
| GET | `/admin/restaurants` | `?status=` | `{ restaurants: Restaurant[] }` |
| GET | `/admin/restaurants/:id` | — | `{ restaurant: Restaurant }` |
| PATCH | `/admin/restaurants/:id` | `{ status: "pending" \| "active" \| "suspended" }` | `{ restaurant: Restaurant }` |
| POST | `/admin/restaurants/:id/locations` | `LocationInput` (below) | `201 { location: Location }` |
| PATCH | `/admin/restaurants/:id/locations/:locationId` | Partial `LocationInput`, or `{ active: false }` to deactivate | `{ location: Location }` |
| GET | `/admin/restaurants/:id/subscription` | — | `{ subscription: Subscription }` (below) |
| PATCH | `/admin/restaurants/:id/subscription` | `{ tier?: "basic" \| "pro", status?: "trialing" \| "active" \| "past_due" \| "cancelled" }` | `{ subscription: Subscription }` |

### Restaurant object
`restaurants` holds only brand-level fields — everything tied to a physical site (address,
contact info, rating/price/photos, **and now hours**) lives on a separate, embedded `locations`
array, because a restaurant can have more than one location (chain/branches) and each location
keeps its own hours. `cuisines` is similarly embedded from its own table, not a column on
`restaurants`.
```json
{
  "restaurant_id":  "restaurant_p9c8b7a6z5",
  "application_id": "app_x8k2m1qzrp",
  "owner_user_id":  "m_q1w2e3r4t5",
  "category_id":    "cat_fine_dining",
  "name":           "The Golden Fork",
  "description":    "Contemporary fine dining, serving the north side.",
  "logo":           "",
  "banner":         "",
  "known_for":      "Rooftop seating, live jazz on weekends",
  "amenities":      ["Wifi", "Parking", "Outdoor seating"],
  "gallery":        [],
  "status":         "active",
  "locations": [
    {
      "location_id":     "loc_h7j2k9m4np",
      "restaurant_id":   "restaurant_p9c8b7a6z5",
      "name":            "",
      "contact_email":   "sam@goldenfork.example",
      "contact_phone":   "+1 555 0100",
      "address":         "218 Street 184, Phnom Penh 12211, Cambodia",
      "city_id":         "city_pp",
      "district_id":     "dist_bkk1",
      "latitude":        11.5646873,
      "longitude":       104.922673,
      "rating":          4.6,
      "rating_count":    771,
      "price_level":     2,
      "price_symbol":    "$$",
      "images":          [],
      "google_place_id": "ChIJI4Pe2TNRCTERBsvdzo-09q8",
      "hours": [
        { "day_of_week": "monday", "closed": false, "open_24h": false, "periods": [{ "open": "11:00", "close": "21:00" }] },
        { "day_of_week": "tuesday", "closed": true, "open_24h": false, "periods": [] }
      ]
    }
  ],
  "cuisines": ["Khmer", "Asian"],
  "subscription": {
    "subscription_id": "sub_a1b2c3d4e5",
    "restaurant_id":   "restaurant_p9c8b7a6z5",
    "tier":            "pro",
    "status":          "trialing",
    "trial_ends_at":   "2026-09-20T00:00:00.000Z"
  }
}
```
**`known_for`/`amenities`/`gallery`**: brand-level display fields, all merchant-editable via
`/merchant/restaurant` below (admin has no write path for them today — read-only here, same as
`name`/`logo`/`banner`). `known_for` is a single free-text tagline (plus `known_for_zh/km/ko`
locale variants, same convention as `name`/`description`). `amenities` is a free-text
`string[]` of tag labels — no controlled vocabulary/table yet, same rationale as
`locations[].images` being a bare array. `gallery` is a `string[]` of merchant-uploaded photo
URLs, additional to `banner` (the hero image) — distinct from `locations[].images`, which is
Places-backfilled and blank for merchant-onboarded locations.

`restaurants` itself has **no** `hours` field anymore — as of the `restaurant_hours.location_id`
re-key, hours are no longer assumed shared across every location of a multi-location brand, so
each entry in `locations` carries its own `hours` instead.
Lifecycle: `pending` (approved, invite not yet redeemed) → `active` (merchant completed invite
acceptance) → `suspended` (admin action, reversible via `PATCH { status: "active" }`).
`application_id` links back to the `merchant_applications` row that created this restaurant — it's
what `resend-invite` (above) uses to find the restaurant for a given application.
`owner_user_id` is blank until the restaurant reaches `active`.

**`locations`** (`restaurant_locations` table, `restaurant_id` FK): a restaurant is created with
exactly one, seeded from the application's `contact_email`/`contact_phone` at approve-time
(`address`/`city_id`/`latitude`/`longitude` blank until the merchant fills them in — see "Merchant
restaurant profile" below). `name` labels a specific branch (e.g. "Downtown Branch"), blank for a
single-location restaurant. `price_symbol` is derived from `price_level`
(`src/utils/restaurantPricing.ts`), not independently stored. `rating`/`rating_count`/`price_level`/
`images`/`google_place_id`/**`district_id`** are directory-import fields (see below) — blank for
merchant-onboarded locations unless backfilled.

`city_id`/`district_id` are FKs into the `cities`/`districts` lookup tables (`schemas/admin/cities.ts`,
`schemas/admin/districts.ts` — same `id`/`name`/`active`/`sort_order` shape as `categories`/`cuisines`,
`districts.city_id` refs `cities`), not free text — this is what backs the "All cities"/"All
districts" filter dropdowns as a cheap read of a small lookup table instead of scanning every
location and de-duping city/district strings in JS, and keeps repeated directory-crawl imports from
drifting into inconsistent spellings for the same place. `district_id` is populated by
`scripts/backfill-district.ts` from the Google Places Details API keyed on `google_place_id`,
resolving (or creating) the matching `districts` row scoped to the location's `city_id` — not
merchant/admin-editable via `LocationInput`, same as the other directory-import fields. `city_id` is
merchant/admin-editable via `LocationInput` below, unlike free-text `city` before it. `GET
/user/restaurants` accepts `city_id`/`district_id` as filter query params — see `WEB_API_GUIDE.md`
§ 3. See section 9a below for the `cities`/`districts` list endpoints.

**Adding/editing locations** (admin-only — merchants can edit locations they already have via
"Merchant restaurant profile" below, but can't add new ones): `POST /admin/restaurants/:id/locations`
creates a new location under restaurant `:id`; `PATCH /admin/restaurants/:id/locations/:locationId`
updates one, including deactivating it (`{ active: false }`) as a soft-delete — the row stays in the
table (so historical reservations/hours tied to it still resolve), only the `active` flag flips.
Nothing currently filters the `locations` array by `active` on read (admin or public `/user/restaurants`
still return every location regardless) — `active` is available for a client to filter/label on, not yet
enforced server-side. Both endpoints 404 if `:id` doesn't match a restaurant, and PATCH additionally
404s if `:locationId` doesn't match a location under that restaurant. Deactivating the restaurant's only
remaining active location is rejected with `400 "Restaurant must have at least one active location"`.
`LocationInput`:
```json
{
  "name":          "Downtown Branch",
  "contact_email": "sam@goldenfork.example",
  "contact_phone": "+1 555 0100",
  "address":       "218 Street 184, Phnom Penh 12211, Cambodia",
  "city_id":       "city_pp",
  "latitude":      11.5646873,
  "longitude":     104.922673,
  "active":        true
}
```
All fields are optional on both create (blank/omitted fields default to `""`/`true` for `active`) and
update (PATCH only touches fields present in the body; sending no updatable field is a `400`).
`city_id`, unlike the other blank-defaulted fields, is left `undefined` rather than `""` when
omitted — it's an FK ref, and the library's FK validator rejects any non-null/undefined value
(including `""`) that doesn't match a real `cities` row, so leaving it unset is how a location stays
cityless for now instead of erroring. A supplied `city_id` must reference an existing `cities` row — same as `category_id` elsewhere in
this API, an FK violation here currently surfaces as a generic `500` rather than a clean `4xx`
(the library throws its own `ValidationError`, not this repo's `AppError`, so `errorHandler.ts`
doesn't special-case it — a known, pre-existing gap, not new to `city_id`).
Directory-import fields (`rating`, `rating_count`, `price_level`, `price_symbol`, `images`,
`google_place_id`, `district_id`) aren't settable through this endpoint — they're populated only by
the directory import / `scripts/backfill-district.ts`.

**`cuisines`**: a many-to-many relationship — `restaurant_cuisines` (one row per
`(restaurant_id, cuisine_id)`) joins `restaurants` to the canonical `cuisines` lookup table
(`cuisine_id`, `name`, `icon`, `active`, `sort_order` — same shape as `categories`, admin-managed at
`/admin/cuisines`, see section 9). The API still returns plain names (`cuisines: string[]`), resolved
server-side; a separate facet from `category_id` (dining style), not a replacement for it.
`seeds/cuisines.ts` seeds the canonical list and must run before `seeds/restaurants.ts`, which links
each restaurant by name. A merchant edits their own restaurant's cuisines via
`PUT /merchant/restaurant/cuisines` (see "Merchant restaurant profile" below).

**`subscription`** (`subscriptions` table, one row per restaurant, `restaurant_id` unique —
Overview.md §5/§6): `tier` is `"basic"` or `"pro"`, `status` is `"trialing" | "active" | "past_due" |
"cancelled"`. A restaurant gets a subscription row automatically the moment its merchant
application is approved (`POST /admin/merchant-applications/:id/approve`, section 3 above), created
as `tier: "pro"`, `status: "trialing"` with a `trial_ends_at` 30 days out — implementing the free
Pro trial funnel (Overview.md §7.2), not the `pending`/unclaimed restaurant this API otherwise
starts a merchant off with. Admin changes tier/status via `PATCH /admin/restaurants/:id/subscription`;
this is currently the **only** place tier changes — there's no self-serve upgrade/downgrade or
payment flow yet. `GET` on either the admin or merchant endpoint (below) lazily creates the row on
first read (same `ensureForRestaurant` used by the approve flow) if it somehow doesn't exist yet, so
callers never have to handle a missing subscription.

**Tier enforcement — branches**: the one subscription-gated rule enforced so far. A restaurant is
created with exactly one location (see above); `POST /admin/restaurants/:id/locations` allows a
second (or further) location only when the restaurant's subscription `tier` is `"pro"` — a `"basic"`
restaurant attempting a second location gets `403 "Upgrade to Pro to add more than one location."`.
This only blocks *new* locations past the limit; a restaurant that already has more than one (e.g.
downgraded from Pro to Basic) isn't retroactively locked — Overview.md §1.3 flags downgrade handling
as a decision still needed, not yet built.

**`locations[].hours`** (`restaurant_hours` table, one row per day, keyed by `location_id` — a
`restaurant_id` is also stored on each row, denormalized for direct cross-location querying, same
convention as `floors`/`rooms`/`tables`): a day missing from the array has no hours configured for
it (distinct from `closed: true`, which is an explicit statement that the location is closed that
day). `periods` holds one `{open, close}` pair per continuous open interval in 24h `"HH:mm"`, more
than one entry for a split-shift location (e.g. lunch + dinner); `close < open` means the period
crosses midnight. Editing hours is a separate write — see "Merchant restaurant profile" below
(the merchant endpoint still edits by restaurant, resolving to that restaurant's primary location
internally — see there).

**Directory-import fields** on a location (`address`, `city_id`, `latitude`/`longitude`, `rating`,
`rating_count`, `price_level`, `price_symbol`, `images`, `google_place_id`) are populated for
restaurants bulk-seeded from an external directory (see `seeds/restaurants.ts`) — blank for
merchant-onboarded locations unless backfilled. An imported restaurant has `status: "active"` with
`owner_user_id`/`application_id` blank from the start — an unclaimed listing, not one that went
through the merchant application/invite flow. `google_place_id` is unique — it's what lets
`pnpm db:seed seeds/restaurants.ts --skip-existing` be rerun safely without creating duplicates.

**Public read-only mirror**: `GET /user/restaurants` and `GET /user/restaurants/:id` (no auth) expose only
`active` restaurants to end customers, with `application_id`/`owner_user_id` stripped — see
`WEB_API_GUIDE.md` section 3. `pending`/`suspended` restaurants 404 there exactly like an unknown
`restaurant_id`, so their existence/status is never leaked publicly. Unlike this admin section,
the public mirror still returns a **restaurant-level** `hours` field (not nested under
`locations`) — it's the flattened union of the restaurant's location(s)' hours
(`restaurantHours.service.ts`'s restaurant-scoped `getForRestaurant`/`getForRestaurants`
convenience wrappers), same rationale as the merchant endpoint above; every restaurant has exactly
one location today so this is a lossless pass-through for now.

---

## 6. Catalog Items — `/admin/catalog-items` and `/merchant/catalog-items`

Restaurant-scoped catalogue (`catalog_items` table) — services or physical products a restaurant sells,
separate from the legacy single-restaurant `services` table (section 2), which keeps working
unmodified. This is what a reservation's `item_id` (see section 3) points at, and what denormalizes
`restaurant_id` onto the resulting reservation.

Two ways to reach the same table, with different scoping:

| Method | Endpoint | Auth | Query / Body | Response |
|--------|----------|------|---------------|----------|
| GET | `/admin/catalog-items` | admin | `?restaurant_id=&item_type=&active=` | `{ items: CatalogItem[] }` |
| GET | `/admin/catalog-items/:id` | admin | — | `{ item: CatalogItem }` |
| POST | `/admin/catalog-items` | admin | `{ restaurant_id, name, price_from, item_type?, ... }` | `{ item: CatalogItem }` (201) |
| PATCH | `/admin/catalog-items/:id` | admin | any updatable field | `{ item: CatalogItem }` |
| DELETE | `/admin/catalog-items/:id` | admin | — | 204 |
| GET | `/merchant/catalog-items` | merchant | `?item_type=&active=` | `{ items: CatalogItem[] }` |
| GET | `/merchant/catalog-items/:id` | merchant | — | `{ item: CatalogItem }` |
| POST | `/merchant/catalog-items` | merchant | `{ name, price_from, item_type?, ... }` | `{ item: CatalogItem }` (201) |
| PATCH | `/merchant/catalog-items/:id` | merchant | any updatable field | `{ item: CatalogItem }` |
| DELETE | `/merchant/catalog-items/:id` | merchant | — | 204 |

The admin routes are cross-restaurant (`restaurant_id` is a request field/filter you choose). The merchant
routes are **always scoped to the caller's own `restaurant_id`**, read from the JWT (`requireMerchant`
middleware, `restaurant_id` embedded at invite-accept/login time — see section 7 below) — a merchant
can never pass a `restaurant_id` to read or write another restaurant's catalog; a `:id` belonging to a
different restaurant 404s rather than leaking a "forbidden" distinction.

`name` and `price_from` are required on create; `item_type` defaults to `"service"` (the other
value is `"product"`, for physical goods like branded merchandise).

The merchant `POST`/`PATCH` routes additionally accept `multipart/form-data` with an
optional `image` file part (JPEG/PNG/WebP, 5MB max) alongside the other fields as
strings — same upload/cleanup behavior as the restaurant `logo`/`banner` fields above
(section "Merchant restaurant profile"): an attached file uploads to Drive and its URL
replaces `image`; sending `image: ""` with no file clears it; the previous file is
best-effort deleted from Drive on replace/clear/item delete. `active` is coerced
from the string `"true"`/`"false"` back to a boolean when sent this way.

### CatalogItem object
```json
{
  "item_id":     "item_p9c8b7a6z5",
  "restaurant_id":     "restaurant_p9c8b7a6z5",
  "item_type":   "service",
  "name":        "Mobile Bath & Groom",
  "description": "At your door, 45 minutes.",
  "price_from":  35,
  "icon":        "",
  "color":       "",
  "image":       "",
  "category_id": "cat_fine_dining",
  "active":      true,
  "sort_order":  0
}
```

### Reservation against a catalog item
`POST /user/reservations` (see `WEB_API_GUIDE.md`) now accepts `item_id` as an alternative to
`service_id` — exactly one of the two is required, not both. Passing `item_id` looks up the
catalog item, denormalizes its `name` onto `reservation.service_name` and its `restaurant_id` onto
`reservation.restaurant_id`; an inactive (`active: false`) item is rejected with `400`. The mobile app
doesn't send `item_id` yet (that's Phase 4 of the multi-store pivot — restaurant browsing UI), but the
API accepts it today.

**Public read-only mirror**: `GET /user/restaurants/:id/catalog-items` (no auth) exists now for that
Phase 4 restaurant-browsing UI — `active: true` items only, for the given restaurant, sorted by `sort_order`.
404s (restaurant not found or not active) using the same rule as the `/user/restaurants/:id` mirror above.
See `WEB_API_GUIDE.md` section 3.

### Merchant restaurant profile — `/merchant/restaurant`

Lets a merchant read and edit their own restaurant's profile fields — the counterpart to
`/admin/restaurants/:id` above, but scoped to the caller instead of an admin-chosen `:id`.

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| GET | `/merchant/restaurant` | merchant | — | `{ restaurant: Restaurant }` (see below) |
| PATCH | `/merchant/restaurant` | merchant | any of `name, description, logo, banner, known_for, amenities, category_id` | `{ restaurant: Restaurant }` |
| PATCH | `/merchant/restaurant/location` | merchant | any of `name, contact_email, contact_phone, address, city_id, latitude, longitude` | `{ location: Location }` |
| PUT | `/merchant/restaurant/hours` | merchant | `{ days: DayHours[] }` | `{ hours: DayHours[] }` |
| PUT | `/merchant/restaurant/cuisines` | merchant | `{ cuisines: string[] }` (cuisine names) | `{ cuisines: string[] }` |
| PUT | `/merchant/restaurant/gallery` | merchant | multipart: `keep` (JSON array of existing photo URLs to retain, in order) + 0+ `gallery` files | `{ gallery: string[] }` |
| GET | `/merchant/restaurant/subscription` | merchant | — | `{ subscription: Subscription }` (section 5's shape) |

`GET`/`PATCH /merchant/restaurant`'s `Restaurant` object differs from section 5's: it embeds
a single `location` (singular — the restaurant's first/primary location) rather than a `locations`
array, since the merchant self-service flow doesn't yet support managing more than one location;
and unlike section 5, `hours` stays a **restaurant-level** field here (not nested under
`location`) — internally it's still the primary location's `restaurant_hours` rows (via
`restaurantHours.service.ts`'s location-scoped functions, resolved through
`restaurantLocationsService.getPrimary()`), just presented flat since a merchant only has the one
location to manage at this phase. `cuisines` is the same embedded shape as section 5.

`PATCH /merchant/restaurant` accepts either a plain JSON body (string fields only) or
`multipart/form-data` with optional `logo`/`banner` file parts (JPEG/PNG/WebP,
5MB max — see `src/middleware/upload.ts`) alongside the same text fields. An
attached file is uploaded to Drive (`src/utils/imageUpload.ts`, wrapping the
`DriveStorageAdapter` configured in `src/lib/adapter.ts`) and its resulting
public URL replaces the corresponding field; the previous file (if any) is
best-effort deleted from Drive. Sending the field as an explicit empty string
with no file attached (`logo: ""`) clears it (and deletes the old file) without
uploading a new one. `amenities`, sent over `multipart/form-data`, must be a
JSON-encoded string of a `string[]` (`amenities: '["Wifi","Parking"]'`) — decoded
server-side before validation; a plain-JSON request body sends it as a real array.

`PUT /merchant/restaurant/gallery` bulk-replaces the restaurant's `gallery` — always
`multipart/form-data`. `keep` is a JSON-encoded array of the existing gallery URLs the
merchant wants to retain, **in their desired final order** — this doubles as the
reorder/remove mechanism (an existing URL left out of `keep` is dropped, both from the
array and, best-effort, from Drive). Any attached `gallery` file parts (JPEG/PNG/WebP,
5MB max each, 10 max per request) are uploaded and appended after `keep`, in submission
order — so newly-added photos always land at the end; reordering a mix of kept and
newly-added photos in one request isn't supported, only reordering within the kept set.

Same JWT-`restaurant_id` scoping as `/merchant/catalog-items` on all three endpoints above — there's
no `:id` in any of these URLs, so a merchant can never target another restaurant's row by guessing/
passing one; the row updated is always the caller's own JWT `restaurant_id` (or that restaurant's
location, for the `/location` endpoint). 404s (not 403) if that restaurant row is somehow missing,
matching the "don't leak a forbidden distinction" convention used elsewhere in this doc.

`PATCH /merchant/restaurant/location` updates the restaurant's primary location, creating one if it
somehow has none yet (shouldn't normally happen — `POST /admin/merchant-applications/:id/approve`
creates one at restaurant-creation time, seeded from the application's contact info).

`PUT /merchant/restaurant/hours` replaces the **entire** week in one call — it resolves this
restaurant's primary location (creating one first, same as `PATCH /merchant/restaurant/location`,
if this restaurant somehow has none yet) and deletes/re-creates all of that location's
`restaurant_hours` rows from `days`, so a day omitted from the array ends up with no hours
configured (not "left unchanged"). Each entry in `days` is
`{ day_of_week, closed?, open_24h?, periods? }`; `periods` (required unless `closed` or
`open_24h`) is `{ open, close }` pairs in 24h `"HH:mm"`. Rejects a day that's both `closed` and
`open_24h`, a duplicate `day_of_week`, or a day with no periods and neither flag set, with `400`.

`PUT /merchant/restaurant/cuisines` replaces the **entire** cuisine set in one call — it deletes
all of this restaurant's `restaurant_cuisines` rows and re-creates them from `cuisines`
(`restaurantCuisines.service.ts`'s `setForRestaurant`), so a cuisine omitted from the array ends up
unlinked (not "left unchanged"). Each entry must be an existing `cuisines.name` exactly (case-
sensitive, no auto-create — add it via `/admin/cuisines` first, section 9); an unrecognized name or
an empty array rejects the whole request with `400` rather than partially applying it.

`GET /merchant/restaurant/subscription` is **read-only** — a merchant can see their own
tier/status/trial info but can't change it; `PATCH /admin/restaurants/:id/subscription` (section 5)
is the only mutation path. Powers the Portal's Billing page.

`status` is **not** an updatable field here — deliberately left out of both the request body
handling and the field list above. It stays admin-only via `PATCH /admin/restaurants/:id` (section 5);
a `status` key in the request body is silently ignored rather than erroring, so existing
frontend code that happens to send the full `Restaurant` object back on save (including `status`)
doesn't break. `name` is required by the underlying schema (`schemas/admin/restaurants.ts`), so
blanking it out (`{ "name": "" }`) is rejected with `400`, same as create-time validation
elsewhere in this API — omitting `name` entirely from the PATCH body is fine and leaves it
unchanged.

---

## 7. Merchant onboarding (public, no auth) — `/merchant`

Unauthenticated endpoints — not under `/admin`, no JWT required. Rate-limited (in-memory,
per-process — see caveat below).

| Method | Endpoint | Rate limit | Body | Response |
|--------|----------|------------|------|----------|
| POST | `/merchant/apply` | 5 / hour / IP | `{ restaurant_name, applicant_name, contact_email, contact_phone?, description? }` | `{ application: MerchantApplication }` (201) |
| GET | `/merchant/invite/:token` | 20 / 15 min / IP | — | `{ restaurant: { name, description, logo }, email, expires_at, account_exists }` |
| POST | `/merchant/invite/:token` | 20 / 15 min / IP | `{ full_name, password }` | `{ token, user, restaurant }` |

`restaurant_name`, `applicant_name`, `contact_email` are required on `POST /apply`.

Invite tokens are single-use, expire after **7 days**, and are stored as an HMAC-SHA256 hash
(`INVITE_TOKEN_SECRET`, separate from `JWT_SECRET`) — the raw token exists only in the emailed
link, never in a database or an API response. `GET /merchant/invite/:token` and the accept variant
both return `404` for an unknown token, `400` for one that's expired, already used, or **revoked**
(superseded by a `resend-invite` call — see "Merchant Applications" above — distinct from "already
used" so a merchant who still has an old email gets pointed at their most recent one instead of a
misleading "already used" message).

**`account_exists` on the GET response:** true when the invite's email already has a `users` row —
the token itself can still be valid/unused (a person can only own one restaurant in this model, see
`restaurant_staff.ts`'s uniqueness comment, so a second approved application for the same email
produces a technically-valid invite that can never be completed). The Portal checks this flag before
rendering the set-password form and shows a "sign in instead" screen when it's true, rather than
letting the merchant fill in the form and hit a 409 from `POST /merchant/invite/:token` on submit.

On successful accept, `POST /merchant/invite/:token`: marks the invite used **before** creating
anything else (fails closed — if a later step throws, the invite is consumed rather than left
redeemable again), creates a `users` row (`role: "merchant"`, inserted directly into the shared
admin sheet — no per-user actor sheet, same pattern as admin accounts), creates the matching
`credentials` row, sets the restaurant's `owner_user_id`/`status: "active"`, and returns a JWT with
`restaurant_id` embedded — the merchant is logged in immediately. That same account can also log in
later via the existing `POST /user/auth/login` (email/password) — no separate merchant login
endpoint exists; the response there also carries `restaurant_id` in the JWT for `role: "merchant"`
accounts. That `restaurant_id` is what scopes every `/merchant/catalog-items` and `/merchant/restaurant`
request above. A merchant can also sign in with the Portal's "Continue with Google" button
(`GET /admin/auth/google`, same endpoint admins use) as long as their Google account's email
matches — `handleAdminGoogleProfile` (`auth.service.ts`) accepts `role: "admin"` or `role: "merchant"`
and, for merchants, resolves and embeds `restaurant_id` into the JWT the same way `login()` does.
No account linking step is needed: the invite-accept flow always sets `auth_provider: "email"` and
creates a `credentials` row, but Google sign-in only matches by email and never checks
`auth_provider`, so both login methods work against the one account.

**`restaurant_id` on the `user` object, not just the JWT:** for `role: "merchant"` accounts, both
`POST /user/auth/login` and `GET /user/auth/me` also merge `restaurant_id` directly onto the returned
`user` object (`auth.service.ts`'s `login()`/`getMe()`, resolved the same way as the JWT payload
via `resolveMerchantRestaurantId`) — e.g. `{ "user": { ..., "role": "merchant", "restaurant_id": "restaurant_..." } }`.
This is in addition to (not instead of) the JWT claim; it exists because a frontend that never
decodes JWTs client-side (the admin portal today) still needs `restaurant_id` from a plain response
field to know which restaurant it's managing. Non-merchant accounts (`admin`/`user`) never get this
field — the response shape for those roles is unchanged. `POST /merchant/invite/:token`'s
`user` field (above) does **not** get this treatment — that flow's caller already gets the restaurant
back as its own separate top-level `restaurant` field in the same response.

**Concurrent redemption:** the whole accept handler is wrapped in a per-token in-process mutex
(`src/lib/mutex.ts`) so two simultaneous `POST`s for the same token can't both pass the "not yet
used" check before either writes — without it, both requests could create their own merchant
account for the same invite, defeating "single-use." Same single-process caveat as the rate
limiter below (a horizontally-scaled deployment would need a shared lock, e.g. Redis `SETNX`).

**Secret strength:** `JWT_SECRET`/`INVITE_TOKEN_SECRET` are checked at startup (`src/config/env.ts`)
for a 32-char minimum and rejected outright if they still equal the literal `.env.example`
placeholder — a `.env` copied without editing those two lines now fails to boot instead of quietly
signing/hashing tokens with a guessable secret.

**Rate-limiting caveat:** `express-rate-limit`'s default in-memory store is per-process and resets
on restart/isn't shared across horizontally-scaled instances — acceptable at this product's current
single-process scale, would need a shared store (e.g. Redis) to hold under horizontal scaling.

---

## 8. Categories — `/admin/categories` and `GET /user/categories`

Shared taxonomy referenced by `category_id` on `restaurants` (section 5), `catalog_items` (section 6),
and `services` (section 2) — replaces the free-text `category` strings those tables used to store.
Admin-managed; merchants and the mobile app only ever read it.

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| GET | `/admin/categories` | admin | `?active=true\|false` | `{ categories: Category[] }` (sorted by `sort_order` asc) |
| GET | `/admin/categories/:id` | admin | — | `{ category: Category }` |
| POST | `/admin/categories` | admin | `{ name, icon?, active?, sort_order? }` | `{ category: Category }` (201) |
| PATCH | `/admin/categories/:id` | admin | any subset of create fields | `{ category: Category }` |
| DELETE | `/admin/categories/:id` | admin | — | `204 No Content` (hard delete) |
| PATCH | `/admin/categories/reorder` | admin | `{ order: string[] }` (category_ids, desired order) | `{ categories: Category[] }` |
| GET | `/user/categories` | none (public) | — | `{ categories: Category[] }` (only `active: true`, sorted by `sort_order` asc) |

`name` is required and must be unique on create; `icon` is a free-text emoji/icon key (mirrors the
`icon` convention on `services`/`catalog_items`), `active` defaults to `true`, `sort_order` to `0`.

### Category object
```json
{
  "category_id": "cat_fine_dining",
  "name":        "Fine Dining",
  "icon":        "🍽️",
  "active":      true,
  "sort_order":  1
}
```

Deleting a category does **not** cascade — any `restaurants`/`catalog_items`/`services` row still
pointing at a deleted `category_id` keeps the stale id rather than being nulled out or blocked.
Prefer `PATCH { active: false }` (which hides it from `GET /user/categories` and therefore from
new dropdown selections) over `DELETE` unless the id was never actually used.

---

## 9. Cuisines — `/admin/cuisines` and `GET /user/cuisines`

Canonical cuisine vocabulary (Khmer, Thai, Italian, ...) that `restaurant_cuisines` (see section 5)
joins restaurants to — a separate facet from `category_id` (dining style), not a replacement for it.
Same shape and CRUD pattern as Categories (section 8) — admin-managed; merchants and the mobile app
only ever read it (merchants select from it via `PUT /merchant/restaurant/cuisines`, below).

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| GET | `/admin/cuisines` | admin | `?active=true\|false` | `{ cuisines: Cuisine[] }` (sorted by `sort_order` asc) |
| GET | `/admin/cuisines/:id` | admin | — | `{ cuisine: Cuisine }` |
| POST | `/admin/cuisines` | admin | `{ name, icon?, active?, sort_order? }` | `{ cuisine: Cuisine }` (201) |
| PATCH | `/admin/cuisines/:id` | admin | any subset of create fields | `{ cuisine: Cuisine }` |
| DELETE | `/admin/cuisines/:id` | admin | — | `204 No Content` (hard delete) |
| PATCH | `/admin/cuisines/reorder` | admin | `{ order: string[] }` (cuisine_ids, desired order) | `{ cuisines: Cuisine[] }` |
| GET | `/user/cuisines` | none (public) | — | `{ cuisines: Cuisine[] }` (only `active: true`, sorted by `sort_order` asc) |

`name` is required and must be unique on create; `icon` is a free-text emoji/icon key, `active`
defaults to `true`, `sort_order` to `0`.

### Cuisine object
```json
{
  "cuisine_id": "cui_a1b2c3d4e5",
  "name":       "Khmer",
  "icon":       "🍲",
  "active":     true,
  "sort_order": 1
}
```

## 10. Cities & Districts — `/admin/cities`, `/admin/districts`, `GET /user/cities`, `GET /user/districts`

Canonical city/district (sublocality/neighborhood) vocabulary that `restaurant_locations.city_id`/
`district_id` (see section 5) reference instead of storing free text — this is what backs the "All
cities"/"All districts" filter dropdowns on `GET /user/restaurants` as a cheap read of these (small)
lookup tables instead of scanning every location and de-duping in JS, and what keeps repeated
directory-crawl imports from drifting into inconsistent spellings for the same place. `districts`
nests under `cities` (`districts.city_id` FK) — a district name is only unique within its city (e.g.
"Riverside" exists in more than one city), not globally. Same CRUD pattern as Categories/Cuisines
(sections 8–9) — admin-managed; merchants and the mobile app only ever read it (a merchant sets
their location's city via `city_id` on `PATCH /merchant/restaurant/location`, section 6).

| Method | Endpoint | Auth | Body | Response |
|--------|----------|------|------|----------|
| GET | `/admin/cities` | admin | `?active=true\|false` | `{ cities: City[] }` (sorted by `sort_order` asc) |
| GET | `/admin/cities/:id` | admin | — | `{ city: City }` |
| POST | `/admin/cities` | admin | `{ name, active?, sort_order? }` | `{ city: City }` (201) |
| PATCH | `/admin/cities/:id` | admin | any subset of create fields | `{ city: City }` |
| DELETE | `/admin/cities/:id` | admin | — | `204 No Content` (hard delete) |
| PATCH | `/admin/cities/reorder` | admin | `{ order: string[] }` (city_ids, desired order) | `{ cities: City[] }` |
| GET | `/user/cities` | none (public) | — | `{ cities: City[] }` (only `active: true`, sorted by `sort_order` asc) |
| GET | `/admin/districts` | admin | `?active=true\|false&city_id=` | `{ districts: District[] }` (sorted by `sort_order` asc) |
| GET | `/admin/districts/:id` | admin | — | `{ district: District }` |
| POST | `/admin/districts` | admin | `{ city_id, name, active?, sort_order? }` | `{ district: District }` (201) |
| PATCH | `/admin/districts/:id` | admin | any subset of create fields | `{ district: District }` |
| DELETE | `/admin/districts/:id` | admin | — | `204 No Content` (hard delete) |
| PATCH | `/admin/districts/reorder` | admin | `{ order: string[] }` (district_ids, desired order) | `{ districts: District[] }` |
| GET | `/user/districts` | none (public) | `?city_id=` | `{ districts: District[] }` (only `active: true`, sorted by `sort_order` asc) |

`name` is required (and unique on `cities`, not on `districts` — see above) on create; `city_id` is
required on `districts` create and must reference an existing `cities` row (`422` if not — unlike
`restaurant_locations.city_id` in section 5, this FK check is validated explicitly in
`src/services/admin/districts.service.ts` rather than relying on the library's own FK validator).
`active` defaults to `true`, `sort_order` to `0`.

### City object
```json
{ "city_id": "city_a1b2c3d4e5", "name": "Phnom Penh", "active": true, "sort_order": 0 }
```

### District object
```json
{ "district_id": "dist_a1b2c3d4e5", "city_id": "city_a1b2c3d4e5", "name": "BKK1", "active": true, "sort_order": 0 }
```

Deleting a cuisine does **not** cascade — any `restaurant_cuisines` row still pointing at a deleted
`cuisine_id` keeps the stale id rather than being nulled out or blocked (same non-cascading
behavior as Categories, section 8). Prefer `PATCH { active: false }` over `DELETE` unless the id
was never actually used. `restaurantCuisines.service.ts`'s `setForRestaurant` (used by both the
merchant picker below and the admin/seed restaurant-linking path) resolves names to ids and
rejects any name that isn't in this table with `400`, so removing a cuisine that's still actively
selected by restaurants will start rejecting re-submissions of their full cuisine list until it's
dropped from the submitted set or re-added here.
