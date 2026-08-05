import { userContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { withTotals } from '../../utils/reservationTotals';
import { restockIfProduct } from '../../utils/stockAdjustment';
import { usersWithSheets, findUser } from '../shared/reservationLookup';

interface ListOrdersQuery {
  status?: string;
  limit?: number;
  offset?: number;
}

// Same lifecycle as admin/reservations.service.ts's TRANSITIONS — merchants get the
// same status-advancement rights admin already has, just scoped to their own restaurant.
const TRANSITIONS: Record<string, string[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['active', 'cancelled'],
  active:    ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

function withOwner(reservation: Record<string, unknown>, user: Record<string, unknown>): Record<string, unknown> {
  return {
    ...withTotals(reservation),
    user_id:    user.user_id,
    user_name:  user.full_name,
    user_email: user.email,
  };
}

// Every query/mutation here is scoped to the caller's own restaurant_id (resolved from
// the JWT by the controller) — a merchant can never read or act on another restaurant's
// orders, regardless of what user_id a client passes in.

export async function list(restaurantId: string, query: ListOrdersQuery) {
  const limit  = Math.min(query.limit ?? 50, 100);
  const offset = query.offset ?? 0;

  const users = await usersWithSheets();
  const where: Record<string, unknown> = { restaurant_id: restaurantId };
  if (query.status) where.status = query.status;

  // A user's actor sheet can go missing out from under its row (e.g. deleted in
  // Drive) without the users table being updated — don't let one bad sheet 500
  // the whole listing for every merchant.
  const perUser = await Promise.all(
    users.map(async (user) => {
      const ctx = userContext(user.user_id as string, user.actor_sheet_id as string);
      try {
        const reservations = await ctx.table('reservations').findMany({ where }) as Record<string, unknown>[];
        return reservations.map((b) => withOwner(b, user));
      } catch (err) {
        console.error(`merchant/orders: failed to read reservations for user ${user.user_id as string}:`, err);
        return [];
      }
    })
  );

  const all = perUser.flat().sort((a, b) => String(b._created_at).localeCompare(String(a._created_at)));

  const total = all.length;
  const page  = all.slice(offset, offset + limit);

  return { orders: page, total, limit, offset };
}

export async function getById(restaurantId: string, id: string, userId: string) {
  const user = await findUser(userId);
  const ctx  = userContext(userId, user.actor_sheet_id as string);

  const reservation = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown> | null;
  if (!reservation || reservation.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Order not found');
  }

  return withOwner(reservation, user);
}

export async function updateStatus(restaurantId: string, id: string, userId: string, status: string) {
  const validStatuses = Object.keys(TRANSITIONS);
  if (!status || !validStatuses.includes(status)) {
    throw new AppError(400, `status must be one of: ${validStatuses.join(', ')}`);
  }

  const user = await findUser(userId);
  const ctx  = userContext(userId, user.actor_sheet_id as string);

  const reservation = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown> | null;
  if (!reservation || reservation.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Order not found');
  }

  const allowed = TRANSITIONS[reservation.status as string] ?? [];
  if (!allowed.includes(status)) {
    throw new AppError(409, `Cannot transition order from ${reservation.status as string} to ${status}`);
  }

  await ctx.table('reservations').update({ where: { reservation_id: id }, data: { status } });

  if (status === 'cancelled') {
    await restockIfProduct(reservation.restaurant_id as string, reservation.service_id as string);
  }

  const updated = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown>;
  return withOwner(updated, user);
}
