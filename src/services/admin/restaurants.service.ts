import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { withDerivedPriceSymbol } from '../../utils/restaurantPricing';

interface ListRestaurantsQuery {
  status?: string;
}

interface UpdateRestaurantStatusInput {
  status?: string;
}

const VALID_STATUSES = ['pending', 'active', 'suspended'];

export async function list(query: ListRestaurantsQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;

  const restaurants = await ctx.table('restaurants').findMany({ where, orderBy: '_created_at', order: 'desc' });
  return { restaurants: restaurants.map(withDerivedPriceSymbol) };
}

export async function getById(id: string) {
  const ctx  = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: id } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }
  return withDerivedPriceSymbol(restaurant);
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
  const updated = await ctx.table('restaurants').findOne({ where: { restaurant_id: id } });
  return updated ? withDerivedPriceSymbol(updated) : updated;
}
