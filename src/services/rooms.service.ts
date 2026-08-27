import { nanoid } from 'nanoid';
import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';

// Shared CRUD core for rooms — same admin/merchant split as floors.service.ts (see
// there for the restaurantId-as-trusted-scope convention).

export interface RoomInput {
  floor_id?: string;
  name?: string;
  name_zh?: string;
  name_km?: string;
  name_ko?: string;
  sort_order?: number;
  active?: boolean;
}

export interface RoomFilters {
  restaurant_id?: string;
  location_id?: string;
  floor_id?: string;
  active?: boolean;
}

async function requireOwnFloor(floorId: string, restaurantId: string): Promise<Record<string, unknown>> {
  const ctx   = adminContext();
  const floor = await ctx.table('floors').findOne({ where: { floor_id: floorId } }) as Record<string, unknown> | null;
  if (!floor || floor.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Floor not found');
  }
  return floor;
}

// No stored capacity column (schemas/admin/rooms.ts) — total seating is derived here
// from this room's tables, one findMany per room, rather than kept in sync on writes.
async function withTotalSeats(room: Record<string, unknown>): Promise<Record<string, unknown>> {
  const ctx    = adminContext();
  const tables = await ctx.table('tables').findMany({ where: { room_id: room.room_id } }) as Record<string, unknown>[];
  const total_seats = tables.reduce((sum, t) => sum + (Number(t.seats) || 0), 0);
  return { ...room, total_seats };
}

export async function list(filters: RoomFilters = {}) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (filters.restaurant_id) where.restaurant_id = filters.restaurant_id;
  if (filters.location_id)   where.location_id   = filters.location_id;
  if (filters.floor_id)      where.floor_id      = filters.floor_id;
  if (filters.active !== undefined) where.active = filters.active;
  const rooms = await ctx.table('rooms').findMany({ where, orderBy: 'sort_order', order: 'asc' }) as Record<string, unknown>[];
  return Promise.all(rooms.map(withTotalSeats));
}

export async function getById(roomId: string) {
  const ctx  = adminContext();
  const room = await ctx.table('rooms').findOne({ where: { room_id: roomId } }) as Record<string, unknown> | null;
  if (!room) {
    throw new AppError(404, 'Room not found');
  }
  return withTotalSeats(room);
}

export async function getOwned(roomId: string, restaurantId: string) {
  const room = await getById(roomId);
  if (room.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Room not found');
  }
  return room;
}

export async function create(restaurantId: string, input: RoomInput) {
  if (!input.floor_id) {
    throw new AppError(400, 'floor_id is required');
  }
  if (!input.name) {
    throw new AppError(400, 'name is required');
  }
  const floor = await requireOwnFloor(input.floor_id, restaurantId);

  const ctx = adminContext();
  const room_id = `room_${nanoid(10)}`;
  await ctx.table('rooms').create({
    room_id,
    restaurant_id: restaurantId,
    location_id:   floor.location_id,
    floor_id:      input.floor_id,
    name:          input.name,
    name_zh:       input.name_zh ?? '',
    name_km:       input.name_km ?? '',
    name_ko:       input.name_ko ?? '',
    sort_order:    input.sort_order ?? 0,
    active:        input.active ?? true,
  });
  return getById(room_id);
}

export async function update(roomId: string, restaurantId: string, input: RoomInput) {
  await getOwned(roomId, restaurantId);

  let newLocationId: unknown;
  if (input.floor_id !== undefined) {
    const floor = await requireOwnFloor(input.floor_id, restaurantId);
    newLocationId = floor.location_id;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'name') && !input.name) {
    throw new AppError(400, 'name is required');
  }

  const data: Record<string, unknown> = {};
  if (input.floor_id !== undefined) {
    data.floor_id    = input.floor_id;
    data.location_id = newLocationId;
  }
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
  await ctx.table('rooms').update({ where: { room_id: roomId }, data });
  return getById(roomId);
}

export async function remove(roomId: string, restaurantId: string): Promise<void> {
  await getOwned(roomId, restaurantId);

  const ctx    = adminContext();
  const tables = await ctx.table('tables').findMany({ where: { room_id: roomId } });
  if (tables.length > 0) {
    throw new AppError(409, 'Room still has tables; remove or reassign them first');
  }

  await ctx.table('rooms').delete({ where: { room_id: roomId } });
}
