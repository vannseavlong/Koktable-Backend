import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import * as restaurantHoursService from '../restaurantHours.service';
import * as restaurantLocationsService from '../restaurantLocations.service';
import * as restaurantCuisinesService from '../restaurantCuisines.service';

interface ListRestaurantsQuery {
  status?: string;
}

interface UpdateRestaurantStatusInput {
  status?: string;
  reason?: string;
}

const VALID_STATUSES = ['pending', 'unclaimed', 'active', 'suspended'];

// Hours are embedded per-location (location.hours), not as a restaurant-level hours[]
// field — a restaurant is no longer assumed to share one set of hours across all its
// sites once it has more than one location (see restaurant_hours' location_id re-key).
// Contrast with restaurantHours.service.ts's restaurant-scoped getForRestaurant(s)
// convenience wrappers, which flatten hours back onto the restaurant for callers
// (merchant/public) that still assume a single location — admin intentionally doesn't
// use those here.
function withLocationHours(
  locations: Record<string, unknown>[],
  hoursByLocation: Map<string, Record<string, unknown>[]>
): Record<string, unknown>[] {
  return locations.map((loc) => ({
    ...loc,
    hours: hoursByLocation.get(loc.location_id as string) ?? [],
  }));
}

function attach(
  restaurant: Record<string, unknown>,
  locations: Record<string, unknown>[],
  cuisines: string[]
): Record<string, unknown> {
  return { ...restaurant, locations, cuisines };
}

export async function list(query: ListRestaurantsQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;

  const restaurants = await ctx.table('restaurants').findMany({ where, orderBy: '_created_at', order: 'desc' }) as Record<string, unknown>[];
  const ids = restaurants.map((r) => r.restaurant_id as string);

  const [locationsByRestaurant, cuisinesByRestaurant] = await Promise.all([
    restaurantLocationsService.getForRestaurants(ids),
    restaurantCuisinesService.getForRestaurants(ids),
  ]);

  // One hours table read total across every restaurant's locations, not one per
  // restaurant or per location.
  const allLocationIds = [...locationsByRestaurant.values()].flatMap((locs) => locs.map((l) => l.location_id as string));
  const hoursByLocation = await restaurantHoursService.getForLocations(allLocationIds);

  return {
    restaurants: restaurants.map((r) => {
      const id = r.restaurant_id as string;
      const locations = withLocationHours(locationsByRestaurant.get(id) ?? [], hoursByLocation);
      return attach(r, locations, cuisinesByRestaurant.get(id) ?? []);
    }),
  };
}

async function getWithDetails(id: string): Promise<Record<string, unknown> | null> {
  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: id } }) as Record<string, unknown> | null;
  if (!restaurant) return null;

  const [locations, cuisines] = await Promise.all([
    restaurantLocationsService.getForRestaurant(id),
    restaurantCuisinesService.getForRestaurant(id),
  ]);
  const locationIds = locations.map((l) => l.location_id as string);
  const hoursByLocation = await restaurantHoursService.getForLocations(locationIds);
  return attach(restaurant, withLocationHours(locations, hoursByLocation), cuisines);
}

export async function getById(id: string) {
  const restaurant = await getWithDetails(id);
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }
  return restaurant;
}

export async function updateStatus(id: string, input: UpdateRestaurantStatusInput, changedBy: string) {
  const { status, reason } = input;
  if (!status || !VALID_STATUSES.includes(status)) {
    throw new AppError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  // Overview.md §1.2: suspend/reactivate needs a required, logged reason.
  if (status === 'suspended' && !reason) {
    throw new AppError(400, 'reason is required to suspend a restaurant');
  }

  const ctx = adminContext();
  const existing = await ctx.table('restaurants').findOne({ where: { restaurant_id: id } }) as Record<string, unknown> | null;
  if (!existing) {
    throw new AppError(404, 'Restaurant not found');
  }

  const suspension_reason = status === 'suspended' ? (reason as string) : '';
  await ctx.table('restaurants').update({ where: { restaurant_id: id }, data: { status, suspension_reason } });

  await ctx.table('restaurant_status_history').create({
    history_id:    `rsh_${nanoid(10)}`,
    restaurant_id: id,
    from_status:   existing.status,
    to_status:     status,
    reason:        reason ?? '',
    changed_by:    changedBy,
    changed_at:    new Date().toISOString(),
  });

  return getWithDetails(id);
}
