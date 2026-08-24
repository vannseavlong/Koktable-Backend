import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import * as restaurantHoursService from './restaurantHours.service';
import * as restaurantLocationsService from './restaurantLocations.service';
import * as restaurantCuisinesService from './restaurantCuisines.service';

// Public, unauthenticated read-only views onto the admin-actor `restaurants`
const PUBLIC_STATUSES = ['active', 'unclaimed'];

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
  cuisine_id?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

// Case-insensitive substring match against name/name_zh/name_km/name_ko — same fields the
// public restaurant object exposes (see toPublicRestaurant above).
const NAME_FIELDS = ['name', 'name_zh', 'name_km', 'name_ko'] as const;

function matchesQuery(restaurant: Record<string, unknown>, q: string): boolean {
  const needle = q.toLowerCase();
  return NAME_FIELDS.some((field) => {
    const value = restaurant[field];
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

export async function list(filters: ListFilters = {}) {
  const ctx = adminContext();
  const all = await ctx.table('restaurants').findMany({}) as Record<string, unknown>[];
  const restaurants = all.filter((r) => PUBLIC_STATUSES.includes(r.status as string));
  const ids = restaurants.map((r) => r.restaurant_id as string);

  const [locationsByRestaurant, cuisinesByRestaurant, hoursByRestaurant, cuisineRestaurantIds] = await Promise.all([
    restaurantLocationsService.getForRestaurants(ids),
    restaurantCuisinesService.getForRestaurants(ids),
    restaurantHoursService.getForRestaurants(ids),
    filters.cuisine_id ? restaurantCuisinesService.getRestaurantIdsForCuisine(filters.cuisine_id) : undefined,
  ]);

  const matchesLocationFilters = (locations: Record<string, unknown>[]) =>
    locations.some((loc) =>
      (!filters.city_id     || loc.city_id     === filters.city_id) &&
      (!filters.district_id || loc.district_id === filters.district_id)
    );

  const matched = restaurants.filter((r) => {
    const id = r.restaurant_id as string;
    if ((filters.city_id || filters.district_id) && !matchesLocationFilters(locationsByRestaurant.get(id) ?? [])) {
      return false;
    }
    if (cuisineRestaurantIds && !cuisineRestaurantIds.has(id)) return false;
    if (filters.q && !matchesQuery(r, filters.q)) return false;
    return true;
  });

  const total = matched.length;

  let limit: number | undefined;
  if (filters.limit !== undefined) {
    if (!Number.isInteger(filters.limit) || filters.limit <= 0) {
      throw new AppError(400, 'Invalid limit: must be a positive integer');
    }
    limit = Math.min(filters.limit, 100);
  }

  let offset: number | undefined;
  if (filters.offset !== undefined) {
    if (!Number.isInteger(filters.offset) || filters.offset < 0) {
      throw new AppError(400, 'Invalid offset: must be a non-negative integer');
    }
    offset = filters.offset;
  }

  const page = limit !== undefined ? matched.slice(offset ?? 0, (offset ?? 0) + limit) : matched;

  return {
    restaurants: page.map((r) => {
      const id = r.restaurant_id as string;
      return toPublicRestaurant(
        r,
        locationsByRestaurant.get(id) ?? [],
        cuisinesByRestaurant.get(id) ?? [],
        hoursByRestaurant.get(id) ?? []
      );
    }),
    total,
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
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
