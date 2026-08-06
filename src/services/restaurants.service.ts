import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import * as restaurantHoursService from './restaurantHours.service';
import * as restaurantLocationsService from './restaurantLocations.service';
import * as restaurantCuisinesService from './restaurantCuisines.service';

// Public, unauthenticated read-only views onto the admin-actor `restaurants`
const PUBLIC_STATUSES = ['active', 'unclaimed'];

// application_id/owner_user_id are internal to the admin invite/ownership flow and are
// stripped from the public response. locations/cuisines/hours are embedded from their
// own tables (restaurantLocations.service.ts, restaurantCuisines.service.ts,
// restaurantHours.service.ts) — none of them are columns on `restaurants` itself.
function toPublicRestaurant(
  restaurant: Record<string, unknown>,
  locations: Record<string, unknown>[],
  cuisines: string[],
  hours: Record<string, unknown>[]
): Record<string, unknown> {
  const { application_id, owner_user_id, ...publicRestaurant } = restaurant;
  return { ...publicRestaurant, locations, cuisines, hours };
}

export interface ListFilters {
  city_id?: string;
  district_id?: string;
}

// city_id/district_id live on restaurant_locations, not restaurants, and a restaurant can
// have several locations — so this can't be pushed into the `restaurants` findMany
// where-clause (equality-only, no join). Same shape as getActiveRestaurantIds below: fetch
// everything, filter to PUBLIC_STATUSES (also equality-only — two values, not one — so this
// filter happens in JS too), then filter in JS again by "at least one location matches".
export async function list(filters: ListFilters = {}) {
  const ctx = adminContext();
  const all = await ctx.table('restaurants').findMany({}) as Record<string, unknown>[];
  const restaurants = all.filter((r) => PUBLIC_STATUSES.includes(r.status as string));
  const ids = restaurants.map((r) => r.restaurant_id as string);

  const [locationsByRestaurant, cuisinesByRestaurant, hoursByRestaurant] = await Promise.all([
    restaurantLocationsService.getForRestaurants(ids),
    restaurantCuisinesService.getForRestaurants(ids),
    restaurantHoursService.getForRestaurants(ids),
  ]);

  const matchesFilters = (locations: Record<string, unknown>[]) =>
    locations.some((loc) =>
      (!filters.city_id     || loc.city_id     === filters.city_id) &&
      (!filters.district_id || loc.district_id === filters.district_id)
    );

  return {
    restaurants: restaurants
      .filter((r) => {
        if (!filters.city_id && !filters.district_id) return true;
        return matchesFilters(locationsByRestaurant.get(r.restaurant_id as string) ?? []);
      })
      .map((r) => {
        const id = r.restaurant_id as string;
        return toPublicRestaurant(
          r,
          locationsByRestaurant.get(id) ?? [],
          cuisinesByRestaurant.get(id) ?? [],
          hoursByRestaurant.get(id) ?? []
        );
      }),
  };
}

// Shared with catalogItems.service.ts's cross-restaurant `GET /user/catalog-items`: the
// longcelot-sheet-db `findMany` where-clause only supports equality (see
// CRUDOperations.matchesWhere), no `in`-style operator, so callers that need to
// filter another table down to "belongs to an active restaurant" fetch this id set and
// filter in JS rather than pushing the join into the adapter.
export async function getActiveRestaurantIds(): Promise<Set<string>> {
  const ctx = adminContext();
  const restaurants = await ctx.table('restaurants').findMany({});
  return new Set(
    restaurants.filter((r) => PUBLIC_STATUSES.includes(r.status as string)).map((s) => s.restaurant_id as string)
  );
}

// Shared by getById and listCatalogItems (and reservations.service.ts's restaurant_id-only
// creation mode): 404s if the restaurant doesn't exist OR isn't publicly visible, without
// distinguishing the two cases in the response.
export async function getActiveRestaurantOrThrow(id: string) {
  const ctx  = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: id } });
  if (!restaurant || !PUBLIC_STATUSES.includes(restaurant.status as string)) {
    throw new AppError(404, 'Restaurant not found');
  }
  return restaurant;
}

export async function getById(id: string) {
  const restaurant = await getActiveRestaurantOrThrow(id);
  const [locations, cuisines, hours] = await Promise.all([
    restaurantLocationsService.getForRestaurant(id),
    restaurantCuisinesService.getForRestaurant(id),
    restaurantHoursService.getForRestaurant(id),
  ]);
  return { restaurant: toPublicRestaurant(restaurant as Record<string, unknown>, locations, cuisines, hours) };
}

export async function listCatalogItems(restaurantId: string) {
  await getActiveRestaurantOrThrow(restaurantId);

  const ctx = adminContext();
  const items = await ctx.table('catalog_items').findMany({
    where:   { restaurant_id: restaurantId, active: true },
    orderBy: 'sort_order',
    order:   'asc',
  });
  return { items };
}
