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
}

const VALID_STATUSES = ['pending', 'active', 'suspended'];

function attach(
  restaurant: Record<string, unknown>,
  locations: Record<string, unknown>[],
  cuisines: string[],
  hours: Record<string, unknown>[]
): Record<string, unknown> {
  return { ...restaurant, locations, cuisines, hours };
}

export async function list(query: ListRestaurantsQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;

  const restaurants = await ctx.table('restaurants').findMany({ where, orderBy: '_created_at', order: 'desc' }) as Record<string, unknown>[];
  const ids = restaurants.map((r) => r.restaurant_id as string);

  const [locationsByRestaurant, cuisinesByRestaurant, hoursByRestaurant] = await Promise.all([
    restaurantLocationsService.getForRestaurants(ids),
    restaurantCuisinesService.getForRestaurants(ids),
    restaurantHoursService.getForRestaurants(ids),
  ]);

  return {
    restaurants: restaurants.map((r) => {
      const id = r.restaurant_id as string;
      return attach(r, locationsByRestaurant.get(id) ?? [], cuisinesByRestaurant.get(id) ?? [], hoursByRestaurant.get(id) ?? []);
    }),
  };
}

async function getWithDetails(id: string): Promise<Record<string, unknown> | null> {
  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: id } }) as Record<string, unknown> | null;
  if (!restaurant) return null;

  const [locations, cuisines, hours] = await Promise.all([
    restaurantLocationsService.getForRestaurant(id),
    restaurantCuisinesService.getForRestaurant(id),
    restaurantHoursService.getForRestaurant(id),
  ]);
  return attach(restaurant, locations, cuisines, hours);
}

export async function getById(id: string) {
  const restaurant = await getWithDetails(id);
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }
  return restaurant;
}

export async function updateStatus(id: string, input: UpdateRestaurantStatusInput) {
  const { status } = input;
  if (!status || !VALID_STATUSES.includes(status)) {
    throw new AppError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const ctx = adminContext();
  const existing = await ctx.table('restaurants').findOne({ where: { restaurant_id: id } });
  if (!existing) {
    throw new AppError(404, 'Restaurant not found');
  }

  await ctx.table('restaurants').update({ where: { restaurant_id: id }, data: { status } });
  return getWithDetails(id);
}
