import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import * as restaurantLocationsService from '../restaurantLocations.service';
import type { LocationInput } from '../restaurantLocations.service';
import * as subscriptionsService from './subscriptions.service';

async function requireRestaurant(restaurantId: string): Promise<void> {
  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: restaurantId } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }
}

// The one tier-gated business rule enforced so far (Overview.md §5: Basic = 1 branch,
// Pro = unlimited). Only guards *new* locations past the first — a restaurant that
// already has more than one (e.g. downgraded from Pro) keeps them; this phase
// deliberately doesn't retroactively lock existing over-limit data (see Overview.md
// §1.3's open question on downgrade handling).
export async function create(restaurantId: string, input: LocationInput) {
  await requireRestaurant(restaurantId);

  const existing = await restaurantLocationsService.getForRestaurant(restaurantId);
  if (existing.length > 0) {
    const subscription = await subscriptionsService.ensureForRestaurant(restaurantId);
    if (subscription.tier !== 'pro') {
      throw new AppError(403, 'Upgrade to Pro to add more than one location.');
    }
  }

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
