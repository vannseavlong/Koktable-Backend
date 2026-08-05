# Restaurant — API Summary for Flutter

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

---

## 1. Auth — `/user/auth`

| Method | Endpoint | Auth | Body → Response |
|--------|----------|------|------------------|
| POST | `/user/auth/register` | — | `{ full_name, email, password }` → `{ token, user }` |
| POST | `/user/auth/login` | — | `{ email, password }` → `{ token, user }` |
| GET | `/user/auth/google` | — | Redirects to Google OAuth consent screen |
| GET | `/user/auth/callback` | — | OAuth callback; redirects to `FRONTEND_URL` with `?token=` |
| GET | `/user/auth/me` | Bearer | → `{ user }` |

`user` object: `{ user_id, email, full_name, role, picture, actor_sheet_id, auth_provider, status }`

```dart
class UserModel {
  final String userId;
  final String email;
  final String fullName;
  final String role;
  final String? picture;
  final String? actorSheetId;

  const UserModel({
    required this.userId,
    required this.email,
    required this.fullName,
    required this.role,
    this.picture,
    this.actorSheetId,
  });

  factory UserModel.fromJson(Map<String, dynamic> j) => UserModel(
        userId:       j['user_id'] as String,
        email:        j['email'] as String,
        fullName:     j['full_name'] as String,
        role:         j['role'] as String,
        picture:      j['picture'] as String?,
        actorSheetId: j['actor_sheet_id'] as String?,
      );
}
```

---

## 2. Services — `/user/services`

| Method | Endpoint | Auth | Body → Response |
|--------|----------|------|------------------|
| GET | `/user/services` | — | → `{ services: ServiceModel[] }` (active only, sorted by `sort_order`) |
| GET | `/user/services/:id` | — | → `{ service }` |

```dart
class ServiceModel {
  final String serviceId;
  final String name;
  final String description;
  final double priceFrom;
  final String icon;     // key into the app's local icon map
  final String color;    // card background hex, e.g. "#D6EAE4"
  final String categoryId;

  const ServiceModel({
    required this.serviceId,
    required this.name,
    required this.description,
    required this.priceFrom,
    required this.icon,
    required this.color,
    required this.categoryId,
  });

  factory ServiceModel.fromJson(Map<String, dynamic> j) => ServiceModel(
        serviceId:   j['service_id'] as String,
        name:        j['name'] as String,
        description: j['description'] as String? ?? '',
        priceFrom:   (j['price_from'] as num).toDouble(),
        icon:        j['icon'] as String,
        color:       j['color'] as String,
        categoryId:  j['category_id'] as String,
      );
}
```

---

## 3. Restaurants & catalog — `/user/restaurants`

Public browsing of merchant restaurants and their catalogs — no auth required for any
route in this section. Only `status: 'active'` restaurants are visible; a restaurant that's
`pending` or `suspended` 404s exactly like an unknown `restaurant_id` (its existence/status
isn't leaked). Catalog items are similarly filtered to `active: true` only, and are
returned sorted by `sort_order` ascending.

| Method | Endpoint | Auth | Body → Response |
|--------|----------|------|------------------|
| GET | `/user/restaurants` | — | → `{ restaurants: RestaurantModel[] }` (active only) |
| GET | `/user/restaurants/:id` | — | → `{ restaurant: RestaurantModel }` (404 if not found or not active) |
| GET | `/user/restaurants/:id/catalog-items` | — | → `{ items: CatalogItemModel[] }` (404 using the same rule as above; active items only, sorted by `sort_order`) |
| GET | `/user/catalog-items` | — | → `{ items: CatalogItemModel[] }` — cross-restaurant feed, see below |

`restaurant` object: `{ restaurant_id, category_id, name, description, logo, banner, status, locations, cuisines, hours }`
— note `application_id` and `owner_user_id` (present on the admin/merchant-scoped
`restaurants` endpoints) are **stripped** here; they're internal to the admin invite/ownership
flow and not customer-facing. `category_id` may be `null`/absent for an uncategorized restaurant —
see section 3a below for resolving it to a display name. `contact_email`/`contact_phone`/`address`/
etc. moved off this object onto `locations` (a restaurant can have more than one physical site);
`locations`, `cuisines`, and `hours` are all structured, not strings — see `ADMIN_API.md` § 5 for
the shapes; none of them are modeled below, this guide predates the split.

`item` object (from `catalog_items`): `{ item_id, restaurant_id, item_type, name, description, price_from, icon, color, image, category_id, active, sort_order }`.

### `GET /user/catalog-items` — cross-restaurant catalog feed

Public, no auth. Returns `active: true` catalog items belonging to `status: 'active'`
restaurants, pulled across **all** restaurants (unlike `/user/restaurants/:id/catalog-items`, which is
scoped to one restaurant). Backs the home screen's "Featured Products" grid.

Query params (both optional):

| Param | Type | Behavior |
|-------|------|----------|
| `type` | `'service' \| 'product'` | Filters `item_type` to this value. Omit to get both types. An unrecognized value returns `400`. |
| `limit` | positive integer | Caps the result count *after* sorting by `sort_order` ascending. Omit for no cap. A non-positive or non-integer value returns `400`. |

Response shape is identical to `/user/restaurants/:id/catalog-items`'s `items` array — same
`CatalogItemModel`, same `image` field, same `sort_order` ascending ordering.

```
GET /user/catalog-items?type=product&limit=10
→ { "items": [ { "item_id": "...", "restaurant_id": "...", "item_type": "product", ... }, ... ] }
```

```dart
class RestaurantModel {
  final String restaurantId;
  final String name;
  final String description;
  final String logo;
  final String banner; // '' if the merchant hasn't set one
  final String status; // always "active" for anything the public API returns
  final String categoryId; // '' if uncategorized
  // locations/cuisines/hours on the wire (see ADMIN_API.md § 5) — not modeled here, this
  // guide predates the split; parse them directly from `j` if/when this model is revived.

  const RestaurantModel({
    required this.restaurantId,
    required this.name,
    required this.description,
    required this.logo,
    this.banner = '',
    required this.status,
    required this.categoryId,
  });

  factory RestaurantModel.fromJson(Map<String, dynamic> j) => RestaurantModel(
        restaurantId:       j['restaurant_id'] as String,
        name:         j['name'] as String,
        description:  j['description'] as String? ?? '',
        logo:         j['logo'] as String? ?? '',
        banner:       j['banner'] as String? ?? '',
        status:       j['status'] as String,
        categoryId:   j['category_id'] as String? ?? '',
      );
}

class CatalogItemModel {
  final String itemId;
  final String restaurantId;
  final String itemType; // "service" | "product"
  final String name;
  final String description;
  final double priceFrom;
  final String icon;
  final String color;
  final String image;
  final String categoryId;

  const CatalogItemModel({
    required this.itemId,
    required this.restaurantId,
    required this.itemType,
    required this.name,
    required this.description,
    required this.priceFrom,
    required this.icon,
    required this.color,
    required this.image,
    required this.categoryId,
  });

  factory CatalogItemModel.fromJson(Map<String, dynamic> j) => CatalogItemModel(
        itemId:      j['item_id'] as String,
        restaurantId:      j['restaurant_id'] as String,
        itemType:    j['item_type'] as String,
        name:        j['name'] as String,
        description: j['description'] as String? ?? '',
        priceFrom:   (j['price_from'] as num).toDouble(),
        icon:        j['icon'] as String? ?? '',
        color:       j['color'] as String? ?? '',
        image:       j['image'] as String? ?? '',
        categoryId:  j['category_id'] as String? ?? '',
      );
}
```

### 3a. Categories — `GET /user/categories`

Public, no auth. The shared taxonomy `category_id` on `RestaurantModel`/`CatalogItemModel`/`ServiceModel`
points into — fetch once and resolve ids to display names/icons client-side (e.g. a `CategoryModel`
map cached alongside the restaurants list) rather than looking up one category at a time.

```
GET /user/categories
→ { "categories": [ { "category_id": "cat_fine_dining", "name": "Fine Dining", "icon": "🍽️", "active": true, "sort_order": 1 }, ... ] }
```
Only `active: true` categories are returned, sorted by `sort_order` ascending — the same list an
admin manages at `/admin/categories` (see `ADMIN_API.md` § 8), filtered to what should currently
appear in the app (e.g. as home-screen category chips).

```dart
class CategoryModel {
  final String categoryId;
  final String name;
  final String icon;
  final int sortOrder;

  const CategoryModel({
    required this.categoryId,
    required this.name,
    required this.icon,
    required this.sortOrder,
  });

  factory CategoryModel.fromJson(Map<String, dynamic> j) => CategoryModel(
        categoryId: j['category_id'] as String,
        name:       j['name'] as String,
        icon:       j['icon'] as String? ?? '',
        sortOrder:  (j['sort_order'] as num?)?.toInt() ?? 0,
      );
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

This is the API behind the **New Reservation** screen (guest name, party size, stay
duration, daily rate, notes → Confirm Reservation). `service_id` is carried over
from whichever service card the user tapped to get here — it is not a field
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
    populates `restaurant_id` on the resulting reservation; not used by this app yet (multi-store pivot
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
`nights` and `total` (`daily_rate * nights`) are computed server-side on every read — use them directly for the confirmation/receipt screen, no client-side math needed.

`restaurant_id` is a multi-store-pivot column — blank unless the reservation was created with `item_id`
(see above), which this app doesn't send yet. Safe to ignore/pass through as-is until Phase 4.

`status` lifecycle: `pending → confirmed → active → completed`, or `→ cancelled` at any point before `completed`.

### Update
- Regular users may only PATCH `notes` and/or set `status: "cancelled"`. Any other status value returns `400`.
- A reservation already `cancelled` or `completed` can no longer be modified (`409`).
- (Moving a reservation through `confirmed` / `active` / `completed` is an admin-side operation, not yet exposed on a user-facing route.)

```dart
class ReservationModel {
  final String reservationId;
  final String guestName;
  final int partySize;
  final String serviceId;
  final String serviceName;
  final DateTime startDate;
  final DateTime endDate;
  final double dailyRate;
  final String notes;
  final String status;
  final int nights;
  final double total;

  const ReservationModel({
    required this.reservationId,
    required this.guestName,
    required this.partySize,
    required this.serviceId,
    required this.serviceName,
    required this.startDate,
    required this.endDate,
    required this.dailyRate,
    required this.notes,
    required this.status,
    required this.nights,
    required this.total,
  });

  factory ReservationModel.fromJson(Map<String, dynamic> j) => ReservationModel(
        reservationId:   j['reservation_id'] as String,
        guestName:     j['guest_name'] as String,
        partySize:     j['party_size'] as int,
        serviceId:   j['service_id'] as String,
        serviceName: j['service_name'] as String,
        startDate:   DateTime.parse(j['start_date'] as String),
        endDate:     DateTime.parse(j['end_date'] as String),
        dailyRate:   (j['daily_rate'] as num).toDouble(),
        notes:       j['notes'] as String? ?? '',
        status:      j['status'] as String,
        nights:      j['nights'] as int,
        total:       (j['total'] as num).toDouble(),
      );
}
```

```dart
class ReservationsRepository {
  Future<ReservationModel> create({
    required String guestName,
    required int partySize,
    required String serviceId,
    required DateTime startDate,
    required DateTime endDate,
    required double dailyRate,
    String? notes,
  }) async {
    final res = await apiClient.post('/user/reservations', data: {
      'guest_name':   guestName,
      'party_size':   partySize,
      'service_id': serviceId,
      'start_date': startDate.toIso8601String().split('T').first,
      'end_date':   endDate.toIso8601String().split('T').first,
      'daily_rate': dailyRate,
      if (notes != null) 'notes': notes,
    });
    return ReservationModel.fromJson(res.data['reservation'] as Map<String, dynamic>);
  }

  Future<List<ReservationModel>> list({String? status}) async {
    final res = await apiClient.get('/user/reservations', params: {
      if (status != null) 'status': status,
    });
    final list = res.data['reservations'] as List<dynamic>;
    return list.map((j) => ReservationModel.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<ReservationModel>> listActive() async {
    final res = await apiClient.get('/user/reservations/active');
    final list = res.data['reservations'] as List<dynamic>;
    return list.map((j) => ReservationModel.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<ReservationModel> cancel(String reservationId) async {
    final res = await apiClient.patch('/user/reservations/$reservationId', data: {
      'status': 'cancelled',
    });
    return ReservationModel.fromJson(res.data['reservation'] as Map<String, dynamic>);
  }
}
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
