import { nanoid } from 'nanoid';
import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';

// Shared CRUD core for tables — same admin/merchant split as floors.service.ts (see
// there for the restaurantId-as-trusted-scope convention).

export const TABLE_SHAPES = ['round', 'square', 'rectangle'];

export interface TableInput {
  room_id?: string;
  label?: string;
  seats?: number;
  shape?: string;
  position_x?: number;
  position_y?: number;
  sort_order?: number;
  active?: boolean;
}

export interface TableFilters {
  restaurant_id?: string;
  location_id?: string;
  room_id?: string;
  active?: boolean;
}

async function requireOwnRoom(roomId: string, restaurantId: string): Promise<Record<string, unknown>> {
  const ctx  = adminContext();
  const room = await ctx.table('rooms').findOne({ where: { room_id: roomId } }) as Record<string, unknown> | null;
  if (!room || room.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Room not found');
  }
  return room;
}

// label isn't unique-enforced at the schema level (this adapter only supports a single
// global .unique() column, and this needs to be scoped per room) — enforced here
// instead, per the note in schemas/admin/tables.ts.
async function requireUniqueLabel(roomId: string, label: string, excludeTableId?: string): Promise<void> {
  const ctx    = adminContext();
  const tables = await ctx.table('tables').findMany({ where: { room_id: roomId } }) as Record<string, unknown>[];
  const clash  = tables.some((t) => t.label === label && t.table_id !== excludeTableId);
  if (clash) {
    throw new AppError(409, `A table labeled "${label}" already exists in this room`);
  }
}

function validateShape(shape: string | undefined): void {
  if (shape !== undefined && !TABLE_SHAPES.includes(shape)) {
    throw new AppError(400, `shape must be one of: ${TABLE_SHAPES.join(', ')}`);
  }
}

export async function list(filters: TableFilters = {}) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (filters.restaurant_id) where.restaurant_id = filters.restaurant_id;
  if (filters.location_id)   where.location_id   = filters.location_id;
  if (filters.room_id)       where.room_id       = filters.room_id;
  if (filters.active !== undefined) where.active = filters.active;
  return ctx.table('tables').findMany({ where, orderBy: 'sort_order', order: 'asc' }) as Promise<Record<string, unknown>[]>;
}

export async function getById(tableId: string) {
  const ctx   = adminContext();
  const table = await ctx.table('tables').findOne({ where: { table_id: tableId } }) as Record<string, unknown> | null;
  if (!table) {
    throw new AppError(404, 'Table not found');
  }
  return table;
}

export async function getOwned(tableId: string, restaurantId: string) {
  const table = await getById(tableId);
  if (table.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Table not found');
  }
  return table;
}

export async function create(restaurantId: string, input: TableInput) {
  if (!input.room_id) {
    throw new AppError(400, 'room_id is required');
  }
  if (!input.label) {
    throw new AppError(400, 'label is required');
  }
  if (input.seats == null || Number(input.seats) < 1) {
    throw new AppError(400, 'seats must be >= 1');
  }
  validateShape(input.shape);

  const room = await requireOwnRoom(input.room_id, restaurantId);
  await requireUniqueLabel(input.room_id, input.label);

  const ctx = adminContext();
  const table_id = `table_${nanoid(10)}`;
  await ctx.table('tables').create({
    table_id,
    restaurant_id: restaurantId,
    location_id:   room.location_id,
    room_id:       input.room_id,
    label:         input.label,
    seats:         Number(input.seats),
    shape:         input.shape ?? 'square',
    ...(input.position_x !== undefined ? { position_x: Number(input.position_x) } : {}),
    ...(input.position_y !== undefined ? { position_y: Number(input.position_y) } : {}),
    sort_order:    input.sort_order ?? 0,
    active:        input.active ?? true,
  });
  return getById(table_id);
}

export async function update(tableId: string, restaurantId: string, input: TableInput) {
  const existing = await getOwned(tableId, restaurantId);

  if (input.seats !== undefined && Number(input.seats) < 1) {
    throw new AppError(400, 'seats must be >= 1');
  }
  validateShape(input.shape);
  if (Object.prototype.hasOwnProperty.call(input, 'label') && !input.label) {
    throw new AppError(400, 'label is required');
  }

  let newLocationId: unknown;
  const roomId = (input.room_id ?? existing.room_id) as string;
  if (input.room_id !== undefined) {
    const room = await requireOwnRoom(input.room_id, restaurantId);
    newLocationId = room.location_id;
  }
  if (input.label !== undefined) {
    await requireUniqueLabel(roomId, input.label, tableId);
  }

  const data: Record<string, unknown> = {};
  if (input.room_id !== undefined) {
    data.room_id     = input.room_id;
    data.location_id = newLocationId;
  }
  if (input.label      !== undefined) data.label      = input.label;
  if (input.seats      !== undefined) data.seats      = Number(input.seats);
  if (input.shape      !== undefined) data.shape      = input.shape;
  if (input.position_x !== undefined) data.position_x = Number(input.position_x);
  if (input.position_y !== undefined) data.position_y = Number(input.position_y);
  if (input.sort_order !== undefined) data.sort_order = input.sort_order;
  if (input.active     !== undefined) data.active     = input.active;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  const ctx = adminContext();
  await ctx.table('tables').update({ where: { table_id: tableId }, data });
  return getById(tableId);
}

export async function remove(tableId: string, restaurantId: string): Promise<void> {
  await getOwned(tableId, restaurantId);
  const ctx = adminContext();
  await ctx.table('tables').delete({ where: { table_id: tableId } });
}
