import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import * as restaurantLocationsService from '../restaurantLocations.service';
import type { LocationInput } from '../restaurantLocations.service';

async function requireRestaurant(restaurantId: string): Promise<void> {
  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: restaurantId } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }
}

export async function create(restaurantId: string, input: LocationInput) {
  await requireRestaurant(restaurantId);
  return restaurantLocationsService.create(restaurantId, input);
}

export async function update(restaurantId: string, locationId: string, input: LocationInput) {
  await requireRestaurant(restaurantId);

  const ctx = adminContext();
  const location = await ctx.table('restaurant_locations').findOne({ where: { location_id: locationId } }) as Record<string, unknown> | null;
  if (!location || location.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Location not found');
  }

  return restaurantLocationsService.update(locationId, input);
}
