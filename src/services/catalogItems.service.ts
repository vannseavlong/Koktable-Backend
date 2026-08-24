import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import { CATALOG_ITEM_TYPES } from '../utils/catalogItems';
import { getActiveRestaurantIds } from './restaurants.service';

// Public, unauthenticated, cross-restaurant view onto `catalog_items` (see
// restaurants.service.ts's listCatalogItems for the restaurant-scoped equivalent, and
// admin/catalogItems.service.ts / merchant/catalogItems.service.ts for the
// full-access variants). Backs the home screen's "Featured Products" grid, which
// pulls from every active restaurant rather than one.

export interface ListQuery {
  type?: string;
  limit?: string;
  q?: string;
}

// Case-insensitive substring match against name/name_zh/name_km/name_ko — same fields the
// public catalog item object exposes.
const NAME_FIELDS = ['name', 'name_zh', 'name_km', 'name_ko'] as const;

function matchesQuery(item: Record<string, unknown>, q: string): boolean {
  const needle = q.toLowerCase();
  return NAME_FIELDS.some((field) => {
    const value = item[field];
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

export async function list(query: ListQuery) {
  const { type, limit: limitRaw, q } = query;

  if (type !== undefined && !CATALOG_ITEM_TYPES.includes(type)) {
    throw new AppError(400, `Invalid type: must be one of ${CATALOG_ITEM_TYPES.join(', ')}`);
  }

  let limit: number | undefined;
  if (limitRaw !== undefined) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new AppError(400, 'Invalid limit: must be a positive integer');
    }
    limit = parsed;
  }

  // Get the active-restaurant-id set first, then filter catalog_items to it in JS —
  // findMany's where clause is equality-only, no `in` operator (see comment on
  // getActiveRestaurantIds in restaurants.service.ts).
  const activeRestaurantIds = await getActiveRestaurantIds();

  const ctx = adminContext();
  const where: Record<string, unknown> = { active: true };
  if (type) {
    where.item_type = type;
  }

  const items = await ctx.table('catalog_items').findMany({
    where,
    orderBy: 'sort_order',
    order:   'asc',
  });

  let visible = items.filter((item) => activeRestaurantIds.has(item.restaurant_id as string));
  if (q) {
    visible = visible.filter((item) => matchesQuery(item as Record<string, unknown>, q));
  }

  return { items: limit !== undefined ? visible.slice(0, limit) : visible };
}
