import { nanoid } from 'nanoid';
import { userContext, adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import { withTotals } from '../utils/reservationTotals';
import { decrementIfProduct, restockIfProduct } from '../utils/stockAdjustment';
import { usersWithSheets } from './shared/reservationLookup';
import { getActiveRestaurantOrThrow } from './restaurants.service';
import type { JwtPayload } from '../middleware/auth';

interface CreateReservationInput {
  guest_name: string;
  party_size: number;
  service_id?: string;
  item_id?: string;
  // Third, mutually-exclusive creation mode: a direct restaurant table reservation,
  // with neither service_id nor item_id. See validateReservationBody/create below.
  restaurant_id?: string;
  start_date: string;
  // Required for the service_id/item_id modes; defaults to start_date in restaurant_id-only mode.
  end_date?: string;
  // Required for the service_id/item_id modes; defaults to 0 in restaurant_id-only mode.
  daily_rate?: number;
  // Wall-clock time slot (e.g. "19:30"); only meaningful in restaurant_id-only mode.
  reservation_time?: string;
  notes?: string;
}

interface ListReservationsQuery {
  status?: string;
  limit?: number;
  offset?: number;
}

interface UpdateReservationInput {
  notes?: string;
  status?: string;
}

// Three mutually-exclusive creation modes:
//  - service_id: legacy single-restaurant `services` table booking (stay-based).
//  - item_id: restaurant-scoped `catalog_items` booking (stay-based).
//  - restaurant_id: direct restaurant table reservation (time-slot based) — new mode,
//    end_date/daily_rate become optional (defaulted in create() below).
// All three still require start_date; only service_id/item_id require end_date/daily_rate
// and a strictly-after end_date, since a stay must span at least one night.
function validateReservationBody(body: Record<string, unknown>): string | null {
  const { guest_name, party_size, service_id, item_id, restaurant_id, start_date, end_date, daily_rate } = body;
  if (!guest_name)   return 'guest_name is required';
  if (!party_size)   return 'party_size is required';
  if (typeof party_size !== 'number' || party_size < 1) {
    return 'party_size must be a number of at least 1';
  }
  if (!start_date) return 'start_date is required';

  const targetCount = [service_id, item_id, restaurant_id].filter(Boolean).length;
  if (targetCount === 0) return 'One of service_id, item_id, or restaurant_id is required';
  if (targetCount > 1)   return 'Provide only one of service_id, item_id, or restaurant_id, not more than one';

  if (service_id || item_id) {
    if (!end_date)   return 'end_date is required';
    if (daily_rate == null) return 'daily_rate is required';
    if (new Date(end_date as string) <= new Date(start_date as string)) {
      return 'end_date must be after start_date';
    }
  } else if (end_date != null && new Date(end_date as string) < new Date(start_date as string)) {
    // restaurant_id-only mode: end_date is optional (defaults to start_date), but if given
    // explicitly it still can't precede start_date.
    return 'end_date cannot be before start_date';
  }

  return null;
}

function requireActorSheet(user: JwtPayload): string {
  if (!user.actor_sheet_id) {
    throw new AppError(422, 'User account has no associated sheet.');
  }
  return user.actor_sheet_id;
}

function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart) <= new Date(bEnd) && new Date(aEnd) >= new Date(bStart);
}

// Soft, best-effort capacity check: there is no shared reservations table (each user's
// reservations live in their own sheet), so "how many reservations already overlap this
// date range" means fanning out over every user-with-a-sheet, same cost/tradeoff
// as usersWithSheets()'s own doc comment. This has a race window (two concurrent
// creates can both pass the check before either writes) and isn't multi-instance
// safe — accepted at this product's current scale rather than building
// cross-request locking for it.
async function checkServiceCapacity(itemId: string, dailyCapacity: number, startDate: string, endDate: string): Promise<void> {
  const users = await usersWithSheets();

  const perUserCounts = await Promise.all(
    users.map(async (user) => {
      const ctx      = userContext(user.user_id as string, user.actor_sheet_id as string);
      const reservations = await ctx.table('reservations').findMany({ where: { service_id: itemId } }) as Record<string, unknown>[];
      return reservations.filter((b) =>
        b.status !== 'cancelled' &&
        rangesOverlap(startDate, endDate, b.start_date as string, b.end_date as string)
      ).length;
    })
  );

  const overlapping = perUserCounts.reduce((sum, n) => sum + n, 0);
  if (overlapping >= dailyCapacity) {
    throw new AppError(409, 'This service is fully booked for the selected dates');
  }
}

export async function create(user: JwtPayload, body: CreateReservationInput) {
  const actorSheetId = requireActorSheet(user);

  const error = validateReservationBody(body as unknown as Record<string, unknown>);
  if (error) {
    throw new AppError(400, error);
  }

  const { guest_name, party_size, service_id, item_id, restaurant_id, start_date, notes, reservation_time } = body;
  let { end_date, daily_rate } = body;

  const adminCtx = adminContext();

  // Three mutually-exclusive reservation targets: the legacy single-restaurant `services` table
  // (service_id, restaurant_id stays blank), a restaurant-scoped `catalog_items` row (item_id,
  // denormalizes the item's restaurant_id onto the reservation), or a direct restaurant table
  // reservation (restaurant_id alone, no service/item — service_id/service_name stay blank).
  // See schemas/user/reservations.ts.
  let resolvedServiceId = '';
  let resolvedServiceName = '';
  let restaurantId = '';

  if (item_id) {
    const item = await adminCtx.table('catalog_items').findOne({ where: { item_id } }) as Record<string, unknown> | null;
    if (!item) {
      throw new AppError(404, 'Catalog item not found');
    }
    if (item.active === false) {
      throw new AppError(400, 'Catalog item is not currently available');
    }
    resolvedServiceId   = item_id;
    resolvedServiceName = item.name as string;
    restaurantId               = item.restaurant_id as string;

    if (item.item_type === 'product') {
      await decrementIfProduct(item_id);
    } else if (item.item_type === 'service' && item.daily_capacity != null) {
      await checkServiceCapacity(item_id, item.daily_capacity as number, start_date, end_date as string);
    }
  } else if (service_id) {
    const service = await adminCtx.table('services').findOne({ where: { service_id } }) as Record<string, string> | null;
    if (!service) {
      throw new AppError(404, 'Service not found');
    }
    resolvedServiceId   = service_id as string;
    resolvedServiceName = service.name;
  } else {
    // restaurant_id-only mode: a direct table reservation, not tied to a services/catalog_items
    // row. Reuses restaurants.service.ts's active-restaurant check so a missing or inactive
    // restaurant 404s the same way it does for the public restaurants API (no status leak).
    await getActiveRestaurantOrThrow(restaurant_id as string);
    restaurantId = restaurant_id as string;
    end_date   = end_date ?? start_date;
    daily_rate = daily_rate ?? 0;
  }

  const ctx        = userContext(user.user_id, actorSheetId);
  const reservation_id = `rsv_${nanoid(10)}`;

  await ctx.table('reservations').create({
    reservation_id,
    guest_name,
    party_size,
    service_id:   resolvedServiceId,
    service_name: resolvedServiceName,
    start_date,
    end_date,
    daily_rate:   Number(daily_rate),
    notes:        notes ?? '',
    status:       'pending',
    restaurant_id:      restaurantId,
    reservation_time:   reservation_time ?? '',
  });

  const reservation = await ctx.table('reservations').findOne({ where: { reservation_id } }) as Record<string, unknown>;
  return withTotals(reservation);
}

export async function list(user: JwtPayload, query: ListReservationsQuery) {
  const actorSheetId = requireActorSheet(user);

  const { status } = query;
  const limit  = Math.min(query.limit ?? 50, 100);
  const offset = query.offset ?? 0;

  const ctx      = userContext(user.user_id, actorSheetId);
  const where    = status ? { status } : {};
  const reservations = await ctx.table('reservations').findMany({
    where,
    orderBy: '_created_at',
    order:   'desc',
    limit,
    offset,
  }) as Record<string, unknown>[];

  const total = await ctx.table('reservations').count({ where });
  return { reservations: reservations.map(withTotals), total, limit, offset };
}

export async function listActive(user: JwtPayload) {
  const actorSheetId = requireActorSheet(user);
  const ctx = userContext(user.user_id, actorSheetId);

  const [confirmed, active] = await Promise.all([
    ctx.table('reservations').findMany({ where: { status: 'confirmed' } }),
    ctx.table('reservations').findMany({ where: { status: 'active'    } }),
  ]) as [Record<string, unknown>[], Record<string, unknown>[]];

  const all = [...active, ...confirmed].map(withTotals);
  return { reservations: all, total: all.length };
}

export async function getById(user: JwtPayload, id: string) {
  const actorSheetId = requireActorSheet(user);
  const ctx     = userContext(user.user_id, actorSheetId);
  const reservation = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown> | null;

  if (!reservation) {
    throw new AppError(404, 'Reservation not found');
  }

  return withTotals(reservation);
}

export async function update(user: JwtPayload, id: string, updates: UpdateReservationInput) {
  const actorSheetId = requireActorSheet(user);

  const { notes, status } = updates;
  const updatableStatuses = ['cancelled'];
  if (status && !updatableStatuses.includes(status)) {
    throw new AppError(400, `Users can only set status to: ${updatableStatuses.join(', ')}`);
  }

  const ctx     = userContext(user.user_id, actorSheetId);
  const reservation = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown> | null;

  if (!reservation) {
    throw new AppError(404, 'Reservation not found');
  }

  if (reservation.status === 'cancelled' || reservation.status === 'completed') {
    throw new AppError(409, `Cannot modify a ${reservation.status} reservation`);
  }

  const data: Record<string, unknown> = {};
  if (notes  !== undefined) data.notes  = notes;
  if (status !== undefined) data.status = status;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided (notes, status)');
  }

  await ctx.table('reservations').update({ where: { reservation_id: id }, data });

  if (status === 'cancelled') {
    await restockIfProduct(reservation.restaurant_id as string, reservation.service_id as string);
  }

  const updated = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown>;
  return withTotals(updated);
}
