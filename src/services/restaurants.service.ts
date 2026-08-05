import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import { withDerivedPriceSymbol } from '../utils/restaurantPricing';
import { summarizeOpeningHours } from '../utils/restaurantHours';

// Public, unauthenticated read-only views onto the admin-actor `restaurants` and
// `catalog_items` tables (see src/services/admin/restaurants.service.ts and
// admin/catalogItems.service.ts for the full-access equivalents). Only
// `status: 'active'` restaurants are customer-visible — pending/suspended restaurants 404 the
// same way an unknown restaurant_id does, so the public API never leaks their existence.

// application_id/owner_user_id are internal to the admin invite/ownership flow and
// are stripped from the public response. price_symbol is re-derived from price_level
// (see restaurantPricing.ts) rather than trusting the stored column, and hours is
// backfilled from opening_hours when blank (see restaurantHours.ts) — bulk-imported
// restaurants only ever had opening_hours populated, so a client reading `hours` alone
// would otherwise see it blank. No client calls this endpoint yet (the Web app is still
// on mock data), but this keeps the response correct for whichever one reads `hours`
// once integration starts, without depending on a one-off data backfill having run.
function toPublicRestaurant(restaurant: Record<string, unknown>) {
  const { application_id, owner_user_id, ...publicRestaurant } = withDerivedPriceSymbol(restaurant);
  if (!publicRestaurant.hours) {
    const summarized = summarizeOpeningHours(publicRestaurant.opening_hours);
    if (summarized) publicRestaurant.hours = summarized;
  }
  return publicRestaurant;
}

export async function list() {
  const ctx = adminContext();
  const restaurants = await ctx.table('restaurants').findMany({ where: { status: 'active' } });
  return { restaurants: restaurants.map(toPublicRestaurant) };
}

// Shared with catalogItems.service.ts's cross-restaurant `GET /user/catalog-items`: the
// longcelot-sheet-db `findMany` where-clause only supports equality (see
// CRUDOperations.matchesWhere), no `in`-style operator, so callers that need to
// filter another table down to "belongs to an active restaurant" fetch this id set and
// filter in JS rather than pushing the join into the adapter.
export async function getActiveRestaurantIds(): Promise<Set<string>> {
  const ctx = adminContext();
  const restaurants = await ctx.table('restaurants').findMany({ where: { status: 'active' } });
  return new Set(restaurants.map((s) => s.restaurant_id as string));
}

// Shared by getById and listCatalogItems: 404s if the restaurant doesn't exist OR isn't
// active, without distinguishing the two cases in the response.
async function getActiveRestaurantOrThrow(id: string) {
  const ctx  = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: id } });
  if (!restaurant || restaurant.status !== 'active') {
    throw new AppError(404, 'Restaurant not found');
  }
  return restaurant;
}

export async function getById(id: string) {
  const restaurant = await getActiveRestaurantOrThrow(id);
  return { restaurant: toPublicRestaurant(restaurant) };
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
