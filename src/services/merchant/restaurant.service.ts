import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import * as restaurantHoursService from '../restaurantHours.service';
import type { DayHoursInput } from '../restaurantHours.service';
import * as restaurantLocationsService from '../restaurantLocations.service';
import type { LocationInput } from '../restaurantLocations.service';
import * as restaurantCuisinesService from '../restaurantCuisines.service';

// Every read/write here is scoped to the merchant's own restaurant_id (resolved from the
// JWT by the controller) — a merchant can never read or write another restaurant's row,
// regardless of what restaurant_id a client might otherwise try to pass in. status is
// intentionally not updatable here — that stays admin-only via PATCH /admin/restaurants/:id.

export interface UpdateRestaurantInput {
  name?: string;
  description?: string;
  logo?: string;
  banner?: string;
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
  if (body.name        !== undefined) data.name        = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.logo        !== undefined) data.logo        = body.logo;
  if (body.banner      !== undefined) data.banner      = body.banner;
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

// Bulk-replaces the merchant's own restaurant's weekly hours — see
// restaurantHours.service.ts setForRestaurant() for the replace-all semantics.
export async function updateOwnHours(restaurantId: string, days: DayHoursInput[]) {
  await getOwn(restaurantId); // 404s if this merchant doesn't own a restaurant
  const hours = await restaurantHoursService.setForRestaurant(restaurantId, days);
  return { hours };
}
