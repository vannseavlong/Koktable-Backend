# Restaurant — API Summary for the Web Booking Client

Backend base URL: `http://localhost:3000` (dev) / `https://your-api.com` (prod)

Every route below (except `/health`) is mounted under the `/user` prefix —
e.g. `POST /user/reservations`, not `POST /reservations`.

All endpoints marked **Bearer** require:
```
Authorization: Bearer <jwt_token>
```

### Error shape (all endpoints)
```json
{ "error": "Human-readable message", "details": ["optional", "validation", "errors"] }
```
Status codes: `400` bad input · `401` unauthenticated · `403` forbidden · `404` not found · `409` conflict · `422` unprocessable · `500` server error

### i18n fields
Admin-curated names/descriptions (categories, cuisines, cities, districts, restaurants,
catalog items, services) carry `_zh`/`_km`/`_ko` siblings next to the base (English) field,
e.g. `name` + `name_zh` + `name_km` + `name_ko`. Blank when untranslated — fall back to the
base field client-side.

---

## 1. Auth — `/user/auth`

| Method | Endpoint | Auth | Body → Response |
|--------|----------|------|------------------|
| POST | `/user/auth/register` | — | `{ full_name, email, password }` → `{ token, user }` |
| POST | `/user/auth/login` | — | `{ email, password }` → `{ token, user }` |
| GET | `/user/auth/google` | — | Mobile app only — redirects to Google OAuth consent screen |
| GET | `/user/auth/callback` | — | Mobile app only; redirects to `FRONTEND_URL` (custom URL scheme) with `?token=` |
| GET | `/user/web/auth/google` | — | **Web client** — redirects to Google OAuth consent screen |
| GET | `/user/web/auth/callback` | — | **Web client** OAuth callback; redirects to `WEB_FRONTEND_URL` (this app's own origin) with `?token=` |
| GET | `/user/auth/me` | Bearer | → `{ user }` |
| POST | `/user/auth/logout` | Bearer | → `204` (no body) |

To add "Sign in with Google" to the Web client, send the browser to `GET /user/web/auth/google`
with a plain link/navigation (not a `fetch`) — it's an OAuth redirect flow, not a JSON endpoint.
After the user consents, Google sends them back through the Backend and it redirects the browser
to `WEB_FRONTEND_URL/?token=<jwt>`. There's no way to round-trip a "return to this page" path
through the flow (the package that drives it always redirects to the bare `frontendUrl`), so the
client should read `token` off the URL once on app load, store it the same way as the
email/password `token`, and strip it from the URL.

`POST /user/auth/logout` revokes the presented token server-side (see `Backend/CLAUDE.md`'s Auth
section) — call it, then discard the token client-side, same as any other logout. It's the only
way to actually invalidate a token before it's naturally forgotten; simply deleting it client-side
leaves it usable by anyone who captured it in transit. A revoked token gets `401` on every
subsequent request, including a retried `logout` call with the same token.

`user` object: `{ user_id, email, full_name, role, picture, actor_sheet_id, auth_provider, status }`

```ts
interface User {
  userId: string;
  email: string;
  fullName: string;
  role: string;
  picture?: string;
  actorSheetId?: string;
}

function parseUser(j: any): User {
  return {
    userId: j.user_id,
    email: j.email,
    fullName: j.full_name,
    role: j.role,
    picture: j.picture ?? undefined,
    actorSheetId: j.actor_sheet_id ?? undefined,
  };
}
```

---

## 2. Services — `/user/services`

| Method | Endpoint | Auth | Body → Response |
|--------|----------|------|------------------|
| GET | `/user/services` | — | → `{ services: Service[] }` (active only, sorted by `sort_order`) |
| GET | `/user/services/:id` | — | → `{ service }` |

```ts
interface Service {
  serviceId: string;
  name: string;
  nameZh: string; nameKm: string; nameKo: string;
  description: string;
  descriptionZh: string; descriptionKm: string; descriptionKo: string;
  priceFrom: number;
  icon: string;   // key into the app's local icon map
  color: string;  // card background hex, e.g. "#D6EAE4"
  categoryId: string;
}

function parseService(j: any): Service {
  return {
    serviceId: j.service_id,
    name: j.name,
    nameZh: j.name_zh ?? '', nameKm: j.name_km ?? '', nameKo: j.name_ko ?? '',
    description: j.description ?? '',
    descriptionZh: j.description_zh ?? '', descriptionKm: j.description_km ?? '', descriptionKo: j.description_ko ?? '',
    priceFrom: j.price_from,
    icon: j.icon,
    color: j.color,
    categoryId: j.category_id,
  };
}
```

---

## 3. Restaurants & catalog — `/user/restaurants`

Public browsing of merchant restaurants and their catalogs — no auth required for any
route in this section. `status: 'active'` and `status: 'unclaimed'` restaurants are both
visible (`unclaimed` covers directory-imported listings and admin-approved applications
whose owner hasn't activated an account yet — see the app's `restaurants` schema comment
and Overview.md §7.1; still fully searchable and bookable). A restaurant that's `pending`
or `suspended` 404s exactly like an unknown `restaurant_id` (its existence/status isn't
leaked). Catalog items are similarly filtered to `active: true` only, and are returned
sorted by `sort_order` ascending.

| Method | Endpoint | Auth | Body → Response |
|--------|----------|------|------------------|
| GET | `/user/restaurants` | — | → `{ restaurants: Restaurant[], total, limit?, offset? }` (active only) |
| GET | `/user/restaurants/:id` | — | → `{ restaurant: Restaurant }` (404 if not found or not active) |
| GET | `/user/restaurants/:id/catalog-items` | — | → `{ items: CatalogItem[] }` (404 using the same rule as above; active items only, sorted by `sort_order`) |
| GET | `/user/catalog-items` | — | → `{ items: CatalogItem[] }` — cross-restaurant feed, see below |

`GET /user/restaurants` query params (all optional, combinable):

| Param | Type | Behavior |
|-------|------|----------|
| `city_id` | string | Exact match against `locations[].city_id` — an id from `GET /user/cities` (section 3c), not a free-text city name. A restaurant matches if **any** of its locations is in that city. |
| `district_id` | string | Exact match against `locations[].district_id` — an id from `GET /user/districts` (section 3c). Combining with `city_id` requires the *same* location to match both. |
| `cuisine_id` | string | Exact match against the restaurant's cuisines — an id from `GET /user/cuisines` (section 3b), not the free-text `cuisines[]` name on the `Restaurant` object. A restaurant matches if it has this cuisine attached (via `restaurant_cuisines`, many-to-many — see `ADMIN_API.md` § 9). Independent of `city_id`/`district_id`: a restaurant must satisfy the location filter(s) *and* have the cuisine, not either/or. |
| `limit` | positive integer | Caps the page size, applied *after* the `city_id`/`district_id`/`cuisine_id` filters above. Capped at 100 (a larger value is silently clamped, not rejected). Omit entirely to get the full filtered set in one response, unpaginated — the pre-pagination behavior, kept for backward compatibility. A non-positive or non-integer value returns `400`. |
| `offset` | non-negative integer | Number of filtered results to skip before taking `limit`. Defaults to `0` when `limit` is supplied. Ignored (no slicing) when `limit` is omitted. A negative or non-integer value returns `400`. |

An unset or empty-string param is ignored (no filtering on that dimension), not a `400`. `total` in the response is always the size of the filtered set (before `limit`/`offset` are applied), so it's safe to use for "have we loaded everything yet" / infinite-scroll logic; `limit`/`offset` are only present in the response when the request supplied them, so an unpaginated call's response shape is unchanged (`{ restaurants, total }`, no extra `null` fields). Fetch `GET /user/cities`/`GET /user/districts`/`GET /user/cuisines` once to populate filter dropdowns, same pattern as Categories/Cuisines (sections 3a–3b) — resolve ids to display names client-side rather than the server returning free-text city/district strings.

```
GET /user/restaurants?city_id=city_pp&district_id=dist_bkk1
→ { "restaurants": [ { "restaurant_id": "...", "locations": [ { "city_id": "city_pp", "district_id": "dist_bkk1", ... } ], ... } ], "total": 1 }

GET /user/restaurants?cuisine_id=cui_khmer
→ { "restaurants": [ { "restaurant_id": "...", "cuisines": ["Khmer"], ... } ], "total": 1 }

GET /user/restaurants?limit=20&offset=20
→ { "restaurants": [ ...next 20... ], "total": 57, "limit": 20, "offset": 20 }
```

Note the request uses `cuisine_id` (an id, resolved from `GET /user/cuisines`) but the response's
`cuisines` field on each restaurant is `string[]` of display **names**, not ids — the two aren't
symmetric. There's no free-text restaurant-name search yet; `cuisine_id`/`city_id`/`district_id`
are the only filter dimensions on this endpoint today.

`restaurant` object: `{ restaurant_id, category_id, name, name_zh, name_km, name_ko, description, description_zh, description_km, description_ko, logo, banner, status, locations, cuisines, hours }`
— note `application_id` and `owner_user_id` (present on the admin/merchant-scoped
`restaurants` endpoints) are **stripped** here; they're internal to the admin invite/ownership
flow and not customer-facing. `category_id` may be `null`/absent for an uncategorized restaurant —
see section 3a below for resolving it to a display name. `contact_email`/`contact_phone`/`address`/
etc. moved off this object onto `locations` (a restaurant can have more than one physical site);
`locations`, `cuisines`, and `hours` are all structured, not strings — see `ADMIN_API.md` § 5 for
the shapes; none of them are modeled below, this guide predates the split. `locations[].city_id`/
`district_id` are FKs into `GET /user/cities`/`GET /user/districts` (section 3c) rather than free
text. `district_id` is a directory-import field (see `scripts/backfill-district.ts`) — blank (`''`)
until backfilled, same as `rating`/`price_level`/`images` for merchant-onboarded locations. Note `hours` here stays
a restaurant-level field (unlike `ADMIN_API.md` § 5's admin view, where hours moved onto each
`locations[]` entry) — the public mirror flattens a restaurant's location(s)' hours back onto the
restaurant object, same as the merchant-facing endpoint (§ 5 "Merchant restaurant profile").

`item` object (from `catalog_items`): `{ item_id, restaurant_id, item_type, name, name_zh, name_km, name_ko, description, description_zh, description_km, description_ko, price_from, icon, color, image, category_id, active, sort_order }`.

### `GET /user/catalog-items` — cross-restaurant catalog feed

Public, no auth. Returns `active: true` catalog items belonging to `status: 'active'`
restaurants, pulled across **all** restaurants (unlike `/user/restaurants/:id/catalog-items`, which is
scoped to one restaurant). Backs the home page's "Featured Products" grid.

Query params (both optional):

| Param | Type | Behavior |
|-------|------|----------|
| `type` | `'service' \| 'product'` | Filters `item_type` to this value. Omit to get both types. An unrecognized value returns `400`. |
| `limit` | positive integer | Caps the result count *after* sorting by `sort_order` ascending. Omit for no cap. A non-positive or non-integer value returns `400`. |

Response shape is identical to `/user/restaurants/:id/catalog-items`'s `items` array — same
`CatalogItem`, same `image` field, same `sort_order` ascending ordering.

```
GET /user/catalog-items?type=product&limit=10
→ { "items": [ { "item_id": "...", "restaurant_id": "...", "item_type": "product", ... }, ... ] }
```

```ts
interface Restaurant {
  restaurantId: string;
  name: string;
  nameZh: string; nameKm: string; nameKo: string;
  description: string;
  descriptionZh: string; descriptionKm: string; descriptionKo: string;
  logo: string;
  banner: string; // '' if the merchant hasn't set one
  status: string; // "active" or "unclaimed" for anything the public API returns
  categoryId: string; // '' if uncategorized
  // locations/cuisines/hours on the wire (see ADMIN_API.md § 5) — not modeled here, this
  // guide predates the split; read them directly from the response if/when this is revived.
}

function parseRestaurant(j: any): Restaurant {
  return {
    restaurantId: j.restaurant_id,
    name: j.name,
    nameZh: j.name_zh ?? '', nameKm: j.name_km ?? '', nameKo: j.name_ko ?? '',
    description: j.description ?? '',
    descriptionZh: j.description_zh ?? '', descriptionKm: j.description_km ?? '', descriptionKo: j.description_ko ?? '',
    logo: j.logo ?? '',
    banner: j.banner ?? '',
    status: j.status,
    categoryId: j.category_id ?? '',
  };
}

interface CatalogItem {
  itemId: string;
  restaurantId: string;
  itemType: string; // "service" | "product"
  name: string;
  nameZh: string; nameKm: string; nameKo: string;
  description: string;
  descriptionZh: string; descriptionKm: string; descriptionKo: string;
  priceFrom: number;
  icon: string;
  color: string;
  image: string;
  categoryId: string;
}

function parseCatalogItem(j: any): CatalogItem {
  return {
    itemId: j.item_id,
    restaurantId: j.restaurant_id,
    itemType: j.item_type,
    name: j.name,
    nameZh: j.name_zh ?? '', nameKm: j.name_km ?? '', nameKo: j.name_ko ?? '',
    description: j.description ?? '',
    descriptionZh: j.description_zh ?? '', descriptionKm: j.description_km ?? '', descriptionKo: j.description_ko ?? '',
    priceFrom: j.price_from,
    icon: j.icon ?? '',
    color: j.color ?? '',
    image: j.image ?? '',
    categoryId: j.category_id ?? '',
  };
}
```

### 3a. Categories — `GET /user/categories`

Public, no auth. The shared taxonomy `category_id` on `Restaurant`/`CatalogItem`/`Service`
points into — fetch once and resolve ids to display names/icons client-side (e.g. a `Category`
map cached alongside the restaurants list) rather than looking up one category at a time.

```
GET /user/categories
→ { "categories": [ { "category_id": "cat_fine_dining", "name": "Fine Dining", "name_zh": "", "name_km": "", "name_ko": "", "icon": "🍽️", "active": true, "sort_order": 1 }, ... ] }
```
Only `active: true` categories are returned, sorted by `sort_order` ascending — the same list an
admin manages at `/admin/categories` (see `ADMIN_API.md` § 8), filtered to what should currently
appear on the site (e.g. as home-page category chips).

```ts
interface Category {
  categoryId: string;
  name: string;
  nameZh: string; nameKm: string; nameKo: string; // blank when untranslated — fall back to `name`
  icon: string;
  sortOrder: number;
}

function parseCategory(j: any): Category {
  return {
    categoryId: j.category_id,
    name: j.name,
    nameZh: j.name_zh ?? '', nameKm: j.name_km ?? '', nameKo: j.name_ko ?? '',
    icon: j.icon ?? '',
    sortOrder: j.sort_order ?? 0,
  };
}
```

---

### 3b. Cuisines — `GET /user/cuisines`

Public, no auth. The canonical cuisine vocabulary (Khmer, Thai, Italian, ...) that a restaurant's
`cuisines: string[]` (section 3) is drawn from — a separate facet from `category_id` (dining
style), not a replacement for it. Fetch once and use as the option list for a cuisine filter/facet
UI, same pattern as 3a Categories.

```
GET /user/cuisines
→ { "cuisines": [ { "cuisine_id": "cui_khmer", "name": "Khmer", "name_zh": "", "name_km": "ខ្មែរ", "name_ko": "", "icon": "🍲", "active": true, "sort_order": 1 }, ... ] }
```
Only `active: true` cuisines are returned, sorted by `sort_order` ascending — the same list an
admin manages at `/admin/cuisines` (see `ADMIN_API.md` § 9).

```ts
interface Cuisine {
  cuisineId: string;
  name: string;
  nameZh: string; nameKm: string; nameKo: string;
  icon: string;
  sortOrder: number;
}

function parseCuisine(j: any): Cuisine {
  return {
    cuisineId: j.cuisine_id,
    name: j.name,
    nameZh: j.name_zh ?? '', nameKm: j.name_km ?? '', nameKo: j.name_ko ?? '',
    icon: j.icon ?? '',
    sortOrder: j.sort_order ?? 0,
  };
}
```

---

### 3c. Cities & Districts — `GET /user/cities`, `GET /user/districts`

Public, no auth. The canonical city/district (sublocality/neighborhood) vocabulary that
`locations[].city_id`/`district_id` (section 3) — and the `city_id`/`district_id` filter params on
`GET /user/restaurants` — point into, instead of free-text city/district strings. Fetch both once
and resolve ids to display names client-side, same pattern as 3a Categories/3b Cuisines — this is
what backs the "All cities"/"All districts" filter dropdowns. `districts` nests under `cities`
(`district.city_id`); pass `?city_id=` to `GET /user/districts` to scope the list to one city for a
cascading "pick a city, then pick a district within it" picker.

```
GET /user/cities
→ { "cities": [ { "city_id": "city_pp", "name": "Phnom Penh", "name_zh": "", "name_km": "ភ្នំពេញ", "name_ko": "", "active": true, "sort_order": 0 }, ... ] }

GET /user/districts?city_id=city_pp
→ { "districts": [ { "district_id": "dist_bkk1", "city_id": "city_pp", "name": "BKK1", "name_zh": "", "name_km": "", "name_ko": "", "active": true, "sort_order": 0 }, ... ] }
```
Only `active: true` rows are returned, sorted by `sort_order` ascending — the same lists an admin
manages at `/admin/cities`/`/admin/districts` (see `ADMIN_API.md` § 10).

```ts
interface City {
  cityId: string;
  name: string;
  nameZh: string; nameKm: string; nameKo: string;
  sortOrder: number;
}

function parseCity(j: any): City {
  return {
    cityId: j.city_id,
    name: j.name,
    nameZh: j.name_zh ?? '', nameKm: j.name_km ?? '', nameKo: j.name_ko ?? '',
    sortOrder: j.sort_order ?? 0,
  };
}

interface District {
  districtId: string;
  cityId: string;
  name: string;
  nameZh: string; nameKm: string; nameKo: string;
  sortOrder: number;
}

function parseDistrict(j: any): District {
  return {
    districtId: j.district_id,
    cityId: j.city_id,
    name: j.name,
    nameZh: j.name_zh ?? '', nameKm: j.name_km ?? '', nameKo: j.name_ko ?? '',
    sortOrder: j.sort_order ?? 0,
  };
}
```

---

## 4. Profile — `/user/profile`

| Method | Endpoint | Auth | Body → Response |
|--------|----------|------|------------------|
| GET | `/user/profile` | Bearer | → `{ profile }` (auto-created on first call) |
| PATCH | `/user/profile` | Bearer | `{ full_name?, phone?, avatar_url?, bio? }` → `{ profile }` |

`profile` object: `{ user_id, full_name, email, phone, avatar_url, bio, role, auth_provider, status }`

---

## 5. Reservations — `/user/reservations`

This is the API behind the booking form (guest name, party size, stay
duration, daily rate, notes → Confirm Reservation). `service_id` is carried over
from whichever service card the user clicked to get here — it is not a field
on the form itself.

| Method | Endpoint | Auth | Body → Response |
|--------|----------|------|------------------|
| POST | `/user/reservations` | Bearer | Create reservation → `{ reservation }` |
| GET | `/user/reservations` | Bearer | `?status=&limit=&offset=` → `{ reservations, total, limit, offset }` |
| GET | `/user/reservations/active` | Bearer | Confirmed + active reservations (Stays tab) → `{ reservations, total }` |
| GET | `/user/reservations/:id` | Bearer | → `{ reservation }` |
| PATCH | `/user/reservations/:id` | Bearer | `{ notes?, status? }` → `{ reservation }` |

### Create — request body
```json
{
  "guest_name":   "Alex Tran",
  "party_size":   2,
  "service_id": "svc_tasting_menu",
  "start_date": "2026-06-12",
  "end_date":   "2026-06-16",
  "daily_rate": 25,
  "notes":      "Window seat preferred"
}
```
- `party_size` must be a number, at least 1
- Exactly one of `service_id` / `item_id` is required (400 if both or neither are sent):
  - `service_id` must reference an existing row in the legacy `services` table (404 if not found)
  - `item_id` must reference an active row in the new restaurant-scoped `catalog_items` table (404 if
    not found, 400 if `active: false`) — see `ADMIN_API.md` § Catalog Items. This is what
    populates `restaurant_id` on the resulting reservation; not used by the site yet (multi-store pivot
    Phase 4 — restaurant browsing UI isn't built), but the field is live on the API today.
- `end_date` must be strictly after `start_date` (400 otherwise)
- `notes` is optional

### Reservation object (response)
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
  "total":        100
}
```
`nights` and `total` (`daily_rate * nights`) are computed server-side on every read — use them directly for the confirmation/receipt page, no client-side math needed.

`restaurant_id` is a multi-store-pivot column — blank unless the reservation was created with `item_id`
(see above), which the site doesn't send yet. Safe to ignore/pass through as-is until Phase 4.

`status` lifecycle: `pending → confirmed → active → completed`, or `→ cancelled` at any point before `completed`.

### Update
- Regular users may only PATCH `notes` and/or set `status: "cancelled"`. Any other status value returns `400`.
- A reservation already `cancelled` or `completed` can no longer be modified (`409`).
- (Moving a reservation through `confirmed` / `active` / `completed` is an admin-side operation, not yet exposed on a user-facing route.)

```ts
interface Reservation {
  reservationId: string;
  guestName: string;
  partySize: number;
  serviceId: string;
  serviceName: string;
  startDate: string; // ISO date, "YYYY-MM-DD"
  endDate: string;
  dailyRate: number;
  notes: string;
  status: string;
  nights: number;
  total: number;
}

function parseReservation(j: any): Reservation {
  return {
    reservationId: j.reservation_id,
    guestName: j.guest_name,
    partySize: j.party_size,
    serviceId: j.service_id,
    serviceName: j.service_name,
    startDate: j.start_date,
    endDate: j.end_date,
    dailyRate: j.daily_rate,
    notes: j.notes ?? '',
    status: j.status,
    nights: j.nights,
    total: j.total,
  };
}
```

```ts
// Thin fetch-based repository — swap the base URL / auth header wiring for whatever the
// web app's HTTP client already does.
const API_BASE = 'http://localhost:3000';

async function apiFetch(path: string, init: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data;
}

export const reservationsApi = {
  async create(input: {
    guestName: string;
    partySize: number;
    serviceId: string;
    startDate: string;
    endDate: string;
    dailyRate: number;
    notes?: string;
  }): Promise<Reservation> {
    const data = await apiFetch('/user/reservations', {
      method: 'POST',
      body: JSON.stringify({
        guest_name: input.guestName,
        party_size: input.partySize,
        service_id: input.serviceId,
        start_date: input.startDate,
        end_date: input.endDate,
        daily_rate: input.dailyRate,
        ...(input.notes ? { notes: input.notes } : {}),
      }),
    });
    return parseReservation(data.reservation);
  },

  async list(status?: string): Promise<Reservation[]> {
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    const data = await apiFetch(`/user/reservations${qs}`);
    return data.reservations.map(parseReservation);
  },

  async listActive(): Promise<Reservation[]> {
    const data = await apiFetch('/user/reservations/active');
    return data.reservations.map(parseReservation);
  },

  async cancel(reservationId: string): Promise<Reservation> {
    const data = await apiFetch(`/user/reservations/${reservationId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' }),
    });
    return parseReservation(data.reservation);
  },
};
```

---

## 6. Commands quick reference

```bash
# Seed services into the admin sheet (run once)
pnpm db:seed seeds/admin.ts --skip-existing

# Seed 3 test user accounts (jamie / taylor / morgan @test.local, password Test1234!)
pnpm db:seed seeds/test-users.ts --skip-existing

# Start the API server
pnpm dev
```
