import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { withDerivedPriceSymbol } from '../../utils/restaurantPricing';
import { summarizeOpeningHours } from '../../utils/restaurantHours';

// Every read/write here is scoped to the merchant's own restaurant_id (resolved from the
// JWT by the controller) — a merchant can never read or write another restaurant's row,
// regardless of what restaurant_id a client might otherwise try to pass in. status is
// intentionally not updatable here — that stays admin-only via PATCH /admin/restaurants/:id.

export interface UpdateRestaurantInput {
  name?: string;
  description?: string;
  logo?: string;
  banner?: string;
  contact_email?: string;
  contact_phone?: string;
  hours?: string;
  category_id?: string;
}

export async function getOwn(restaurantId: string) {
  const ctx  = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: restaurantId } }) as Record<string, unknown> | null;
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }

  const withPrice = withDerivedPriceSymbol(restaurant);
  if (!withPrice.hours) {
    const summarized = summarizeOpeningHours(withPrice.opening_hours);
    if (summarized) withPrice.hours = summarized;
  }
  return withPrice;
}

export async function updateOwn(restaurantId: string, body: UpdateRestaurantInput) {
  await getOwn(restaurantId);

  if (Object.prototype.hasOwnProperty.call(body, 'name') && !body.name) {
    throw new AppError(400, 'name is required');
  }

  const data: Record<string, unknown> = {};
  if (body.name          !== undefined) data.name          = body.name;
  if (body.description   !== undefined) data.description   = body.description;
  if (body.logo          !== undefined) data.logo          = body.logo;
  if (body.banner        !== undefined) data.banner        = body.banner;
  if (body.contact_email !== undefined) data.contact_email = body.contact_email;
  if (body.contact_phone !== undefined) data.contact_phone = body.contact_phone;
  if (body.hours         !== undefined) data.hours         = body.hours;
  if (body.category_id   !== undefined) data.category_id   = body.category_id;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  const ctx = adminContext();
  await ctx.table('restaurants').update({ where: { restaurant_id: restaurantId }, data });
  return getOwn(restaurantId);
}
