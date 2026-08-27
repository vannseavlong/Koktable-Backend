import { nanoid } from 'nanoid';
import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';

// Shared CRUD core for floors, called by both admin/floors.service.ts (any restaurant,
// after an explicit restaurant-exists check) and merchant/floors.service.ts (the
// caller's own restaurant_id, resolved from the JWT). Every function here takes
// restaurantId as an already-trusted scope — re-deriving/authorizing it against the
// caller's identity is the wrapper's job, not this module's.

export interface FloorInput {
  location_id?: string;
  name?: string;
  name_zh?: string;
  name_km?: string;
  name_ko?: string;
  sort_order?: number;
  active?: boolean;
}

export interface FloorFilters {
  restaurant_id?: string;
  location_id?: string;
  active?: boolean;
}

async function requireOwnLocation(locationId: string, restaurantId: string): Promise<void> {
  const ctx = adminContext();
  const location = await ctx.table('restaurant_locations').findOne({ where: { location_id: locationId } }) as Record<string, unknown> | null;
  if (!location || location.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Location not found');
  }
}

export async function list(filters: FloorFilters = {}) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (filters.restaurant_id) where.restaurant_id = filters.restaurant_id;
  if (filters.location_id)   where.location_id   = filters.location_id;
  if (filters.active !== undefined) where.active = filters.active;
  return ctx.table('floors').findMany({ where, orderBy: 'sort_order', order: 'asc' }) as Promise<Record<string, unknown>[]>;
}

export async function getById(floorId: string) {
  const ctx   = adminContext();
  const floor = await ctx.table('floors').findOne({ where: { floor_id: floorId } }) as Record<string, unknown> | null;
  if (!floor) {
    throw new AppError(404, 'Floor not found');
  }
  return floor;
}

export async function getOwned(floorId: string, restaurantId: string) {
  const floor = await getById(floorId);
  if (floor.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Floor not found');
  }
  return floor;
}

export async function create(restaurantId: string, input: FloorInput) {
  if (!input.location_id) {
    throw new AppError(400, 'location_id is required');
  }
  if (!input.name) {
    throw new AppError(400, 'name is required');
  }
  await requireOwnLocation(input.location_id, restaurantId);

  const ctx = adminContext();
  const floor_id = `floor_${nanoid(10)}`;
  await ctx.table('floors').create({
    floor_id,
    restaurant_id: restaurantId,
    location_id:   input.location_id,
    name:          input.name,
    name_zh:       input.name_zh ?? '',
    name_km:       input.name_km ?? '',
    name_ko:       input.name_ko ?? '',
    sort_order:    input.sort_order ?? 0,
    active:        input.active ?? true,
  });
  return getById(floor_id);
}

export async function update(floorId: string, restaurantId: string, input: FloorInput) {
  await getOwned(floorId, restaurantId);

  if (input.location_id !== undefined) {
    await requireOwnLocation(input.location_id, restaurantId);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'name') && !input.name) {
    throw new AppError(400, 'name is required');
  }

  const data: Record<string, unknown> = {};
  if (input.location_id !== undefined) data.location_id = input.location_id;
  if (input.name        !== undefined) data.name        = input.name;
  if (input.name_zh     !== undefined) data.name_zh     = input.name_zh;
  if (input.name_km     !== undefined) data.name_km     = input.name_km;
  if (input.name_ko     !== undefined) data.name_ko     = input.name_ko;
  if (input.sort_order  !== undefined) data.sort_order  = input.sort_order;
  if (input.active      !== undefined) data.active      = input.active;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  const ctx = adminContext();
  await ctx.table('floors').update({ where: { floor_id: floorId }, data });
  return getById(floorId);
}

export async function remove(floorId: string, restaurantId: string): Promise<void> {
  await getOwned(floorId, restaurantId);

  const ctx   = adminContext();
  const rooms = await ctx.table('rooms').findMany({ where: { floor_id: floorId } });
  if (rooms.length > 0) {
    throw new AppError(409, 'Floor still has rooms; remove or reassign them first');
  }

  await ctx.table('floors').delete({ where: { floor_id: floorId } });
}
