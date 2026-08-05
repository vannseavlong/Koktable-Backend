import { nanoid } from 'nanoid';
import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import { withDerivedPriceSymbol } from '../utils/restaurantPricing';

export interface LocationInput {
  name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
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
    contact_email: input.contact_email ?? '',
    contact_phone: input.contact_phone ?? '',
    address:       input.address ?? '',
    city:          input.city ?? '',
    latitude:      input.latitude,
    longitude:     input.longitude,
  });
  const created = await ctx.table('restaurant_locations').findOne({ where: { location_id } }) as Record<string, unknown>;
  return withDerivedPriceSymbol(created);
}

export async function update(locationId: string, input: LocationInput) {
  const ctx = adminContext();
  const existing = await ctx.table('restaurant_locations').findOne({ where: { location_id: locationId } });
  if (!existing) {
    throw new AppError(404, 'Location not found');
  }

  const data: Record<string, unknown> = {};
  if (input.name          !== undefined) data.name          = input.name;
  if (input.contact_email !== undefined) data.contact_email = input.contact_email;
  if (input.contact_phone !== undefined) data.contact_phone = input.contact_phone;
  if (input.address       !== undefined) data.address       = input.address;
  if (input.city          !== undefined) data.city          = input.city;
  if (input.latitude      !== undefined) data.latitude      = input.latitude;
  if (input.longitude     !== undefined) data.longitude     = input.longitude;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('restaurant_locations').update({ where: { location_id: locationId }, data });
  const updated = await ctx.table('restaurant_locations').findOne({ where: { location_id: locationId } }) as Record<string, unknown>;
  return withDerivedPriceSymbol(updated);
}
