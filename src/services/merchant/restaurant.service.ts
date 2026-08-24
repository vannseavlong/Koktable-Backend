import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import * as restaurantHoursService from '../restaurantHours.service';
import type { DayHoursInput } from '../restaurantHours.service';
import * as restaurantLocationsService from '../restaurantLocations.service';
import type { LocationInput } from '../restaurantLocations.service';
import * as restaurantCuisinesService from '../restaurantCuisines.service';
import * as subscriptionsService from '../admin/subscriptions.service';
import { sanitizeCell } from '../../utils/sheetSanitize';

// Every read/write here is scoped to the merchant's own restaurant_id (resolved from the
// JWT by the controller) — a merchant can never read or write another restaurant's row,
// regardless of what restaurant_id a client might otherwise try to pass in. status is
// intentionally not updatable here — that stays admin-only via PATCH /admin/restaurants/:id.

export interface UpdateRestaurantInput {
  name?: string;
  name_zh?: string;
  name_km?: string;
  name_ko?: string;
  description?: string;
  description_zh?: string;
  description_km?: string;
  description_ko?: string;
  logo?: string;
  banner?: string;
  known_for?: string;
  known_for_zh?: string;
  known_for_km?: string;
  known_for_ko?: string;
  amenities?: string[];
  category_id?: string;
}

export async function getOwn(restaurantId: string) {
  const ctx  = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: restaurantId } }) as Record<string, unknown> | null;
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }

  const [location, cuisines, hours] = await Promise.all([
    restaurantLocationsService.getPrimary(restaurantId),
    restaurantCuisinesService.getForRestaurant(restaurantId),
    restaurantHoursService.getForRestaurant(restaurantId),
  ]);
  return { ...restaurant, location, cuisines, hours } as Record<string, unknown>;
}

export async function updateOwn(restaurantId: string, body: UpdateRestaurantInput) {
  await getOwn(restaurantId);

  if (Object.prototype.hasOwnProperty.call(body, 'name') && !body.name) {
    throw new AppError(400, 'name is required');
  }

  const data: Record<string, unknown> = {};
  if (body.name        !== undefined) data.name        = sanitizeCell(body.name);
  if (body.name_zh     !== undefined) data.name_zh     = sanitizeCell(body.name_zh);
  if (body.name_km     !== undefined) data.name_km     = sanitizeCell(body.name_km);
  if (body.name_ko     !== undefined) data.name_ko     = sanitizeCell(body.name_ko);
  if (body.description !== undefined) data.description = sanitizeCell(body.description);
  if (body.description_zh !== undefined) data.description_zh = sanitizeCell(body.description_zh);
  if (body.description_km !== undefined) data.description_km = sanitizeCell(body.description_km);
  if (body.description_ko !== undefined) data.description_ko = sanitizeCell(body.description_ko);
  if (body.logo        !== undefined) data.logo        = body.logo;
  if (body.banner      !== undefined) data.banner      = body.banner;
  if (body.known_for      !== undefined) data.known_for      = sanitizeCell(body.known_for);
  if (body.known_for_zh   !== undefined) data.known_for_zh   = sanitizeCell(body.known_for_zh);
  if (body.known_for_km   !== undefined) data.known_for_km   = sanitizeCell(body.known_for_km);
  if (body.known_for_ko   !== undefined) data.known_for_ko   = sanitizeCell(body.known_for_ko);
  if (body.amenities   !== undefined) {
    if (!Array.isArray(body.amenities) || !body.amenities.every((a) => typeof a === 'string')) {
      throw new AppError(400, 'amenities must be an array of strings');
    }
    data.amenities = body.amenities.map((a) => sanitizeCell(a.trim())).filter(Boolean);
  }
  if (body.category_id !== undefined) data.category_id = body.category_id;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  const ctx = adminContext();
  await ctx.table('restaurants').update({ where: { restaurant_id: restaurantId }, data });
  return getOwn(restaurantId);
}

// Updates the merchant's primary location (address/contact/coordinates) — creates one if
// this restaurant somehow has none yet (shouldn't normally happen; approve() in
// merchantApplications.service.ts creates one at restaurant-creation time).
export async function updateOwnLocation(restaurantId: string, input: LocationInput) {
  await getOwn(restaurantId); // 404s if this merchant doesn't own a restaurant

  const existing = await restaurantLocationsService.getPrimary(restaurantId);
  const location = existing
    ? await restaurantLocationsService.update(existing.location_id as string, input)
    : await restaurantLocationsService.create(restaurantId, input);
  return { location };
}

// Bulk-replaces the merchant's own restaurant's weekly hours. Hours are stored
// per-location now (restaurant_hours.location_id — see restaurantHours.service.ts), but
// this endpoint's external contract is unchanged: merchants still manage exactly one
// (primary) location's hours at this phase, so this resolves the primary location
// (creating one first if this restaurant somehow has none yet, same as
// updateOwnLocation() above) and writes via setForLocation() — see there for the
// replace-all semantics.
export async function updateOwnHours(restaurantId: string, days: DayHoursInput[]) {
  await getOwn(restaurantId); // 404s if this merchant doesn't own a restaurant

  const existing = await restaurantLocationsService.getPrimary(restaurantId);
  const location = existing ?? await restaurantLocationsService.create(restaurantId, {});
  const hours = await restaurantHoursService.setForLocation(location.location_id as string, days);
  return { hours };
}

// Bulk-replaces the merchant's own restaurant's cuisines — see
// restaurantCuisines.service.ts setForRestaurant() for the replace-all semantics.
export async function updateOwnCuisines(restaurantId: string, cuisineNames: string[]) {
  await getOwn(restaurantId); // 404s if this merchant doesn't own a restaurant
  const cuisines = await restaurantCuisinesService.setForRestaurant(restaurantId, cuisineNames);
  return { cuisines };
}

// Bulk-replaces the merchant's own restaurant's gallery (additional photos, distinct
// from `banner`) — same replace-all shape as hours/cuisines above. The controller
// (routes/merchant/restaurant.routes.ts's PUT /gallery) resolves the final ordered
// array before calling this: existing URLs the merchant chose to keep (reordered as
// desired) followed by newly-uploaded ones, and best-effort deletes from Drive
// anything that was dropped. This function just persists the final array.
export async function updateOwnGallery(restaurantId: string, gallery: string[]) {
  await getOwn(restaurantId); // 404s if this merchant doesn't own a restaurant

  const ctx = adminContext();
  await ctx.table('restaurants').update({ where: { restaurant_id: restaurantId }, data: { gallery } });
  return { gallery };
}

// Read-only for merchants — tier/status changes are admin-only, via
// PATCH /admin/restaurants/:id/subscription. ensureForRestaurant() rather than a plain
// get so a restaurant that predates this feature (or somehow never got one) still gets
// a real subscription row instead of the Portal having to handle a null one.
export async function getOwnSubscription(restaurantId: string) {
  await getOwn(restaurantId); // 404s if this merchant doesn't own a restaurant
  return subscriptionsService.ensureForRestaurant(restaurantId);
}
