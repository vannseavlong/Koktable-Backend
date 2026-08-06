import { nanoid } from 'nanoid';
import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import { withDerivedPriceSymbol } from '../utils/restaurantPricing';

export interface LocationInput {
  name?: string;
  name_zh?: string;
  name_km?: string;
  name_ko?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city_id?: string;
  latitude?: number;
  longitude?: number;
  active?: boolean;
}

export async function getForRestaurant(restaurantId: string) {
  const ctx  = adminContext();
  const rows = await ctx.table('restaurant_locations').findMany({ where: { restaurant_id: restaurantId } }) as Record<string, unknown>[];
  return rows.map(withDerivedPriceSymbol);
}

// One table read total instead of one per restaurant.
export async function getForRestaurants(restaurantIds: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const ctx = adminContext();
  const all = await ctx.table('restaurant_locations').findMany({}) as Record<string, unknown>[];
  const ids = new Set(restaurantIds);
  const byRestaurant = new Map<string, Record<string, unknown>[]>();
  for (const row of all) {
    const restaurantId = row.restaurant_id as string;
    if (!ids.has(restaurantId)) continue;
    if (!byRestaurant.has(restaurantId)) byRestaurant.set(restaurantId, []);
    byRestaurant.get(restaurantId)!.push(withDerivedPriceSymbol(row));
  }
  return byRestaurant;
}

// The merchant-facing "single location" view — the first location created for a
// restaurant. Multi-location management (choosing/adding a specific branch) is an admin
// concern for later; the merchant self-service flow assumes one primary site for now.
export async function getPrimary(restaurantId: string) {
  const locations = await getForRestaurant(restaurantId);
  return locations[0] ?? null;
}

export async function create(restaurantId: string, input: LocationInput) {
  const ctx = adminContext();
  const location_id = `loc_${nanoid(10)}`;
  await ctx.table('restaurant_locations').create({
    location_id,
    restaurant_id: restaurantId,
    name:          input.name ?? '',
    name_zh:       input.name_zh ?? '',
    name_km:       input.name_km ?? '',
    name_ko:       input.name_ko ?? '',
    contact_email: input.contact_email ?? '',
    contact_phone: input.contact_phone ?? '',
    address:       input.address ?? '',
    // Left undefined (not '') when omitted, unlike the plain-string fields above: city_id
    // is an FK ref (schemas/admin/restaurant_locations.ts) and the library's FK validator
    // runs on any non-null/undefined value, including '' — an empty string would fail as
    // "city '' does not exist" instead of just leaving the location cityless for now.
    city_id:       input.city_id,
    latitude:      input.latitude,
    longitude:     input.longitude,
    active:        input.active ?? true,
  });
  const created = await ctx.table('restaurant_locations').findOne({ where: { location_id } }) as Record<string, unknown>;
  return withDerivedPriceSymbol(created);
}

export async function update(locationId: string, input: LocationInput) {
  const ctx = adminContext();
  const existing = await ctx.table('restaurant_locations').findOne({ where: { location_id: locationId } }) as Record<string, unknown> | null;
  if (!existing) {
    throw new AppError(404, 'Location not found');
  }

  if (input.active === false) {
    const restaurantId = existing.restaurant_id as string;
    const siblings = await ctx.table('restaurant_locations').findMany({ where: { restaurant_id: restaurantId } }) as Record<string, unknown>[];
    const otherActiveCount = siblings.filter((loc) => loc.location_id !== locationId && loc.active).length;
    if (otherActiveCount === 0) {
      throw new AppError(400, 'Restaurant must have at least one active location');
    }
  }

  const data: Record<string, unknown> = {};
  if (input.name          !== undefined) data.name          = input.name;
  if (input.name_zh       !== undefined) data.name_zh       = input.name_zh;
  if (input.name_km       !== undefined) data.name_km       = input.name_km;
  if (input.name_ko       !== undefined) data.name_ko       = input.name_ko;
  if (input.contact_email !== undefined) data.contact_email = input.contact_email;
  if (input.contact_phone !== undefined) data.contact_phone = input.contact_phone;
  if (input.address       !== undefined) data.address       = input.address;
  if (input.city_id       !== undefined) data.city_id       = input.city_id;
  if (input.latitude      !== undefined) data.latitude      = input.latitude;
  if (input.longitude     !== undefined) data.longitude     = input.longitude;
  if (input.active        !== undefined) data.active        = input.active;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('restaurant_locations').update({ where: { location_id: locationId }, data });
  const updated = await ctx.table('restaurant_locations').findOne({ where: { location_id: locationId } }) as Record<string, unknown>;
  return withDerivedPriceSymbol(updated);
}
