import { userContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { withTotals } from '../../utils/reservationTotals';
import { restockIfProduct } from '../../utils/stockAdjustment';
import { usersWithSheets, findUser } from '../shared/reservationLookup';

interface ListReservationsQuery {
  status?: string;
  restaurant_id?: string;
  limit?: number;
  offset?: number;
}

// Reservation transition rules mirror the lifecycle documented in WEB_API_GUIDE.md.
// Regular users may only reach 'cancelled' via PATCH /user/reservations/:id; every
// other transition (confirmed -> active -> completed) is admin-only, driven here.
// 'forwarded' is admin-only (see reservationForwards.service.ts, which sets it as a
// side effect of logging a forward attempt — not reachable via this plain status PATCH);
// listed here only so TRANSITIONS documents its onward moves.
const TRANSITIONS: Record<string, string[]> = {
  pending:    ['waitlisted', 'forwarded', 'confirmed', 'cancelled'],
  waitlisted: ['confirmed', 'cancelled'],
  forwarded:  ['confirmed', 'cancelled'],
  confirmed:  ['active', 'cancelled'],
  active:     ['completed', 'no_show', 'cancelled'],
  completed:  [],
  no_show:    [],
  cancelled:  [],
};

function withOwner(reservation: Record<string, unknown>, user: Record<string, unknown>): Record<string, unknown> {
  return {
    ...withTotals(reservation),
    user_id:    user.user_id,
    user_name:  user.full_name,
    user_email: user.email,
  };
}

export async function list(query: ListReservationsQuery) {
  const { status, restaurant_id } = query;
  const limit  = Math.min(query.limit ?? 50, 100);
  const offset = query.offset ?? 0;

  const users = await usersWithSheets();
  const where: Record<string, unknown> = {};
  if (status)  where.status  = status;
  // Only matches reservations created against a catalog_items row (POST /user/reservations
  // with item_id) — reservations against the legacy `services` table still have a blank
  // restaurant_id. See schemas/user/reservations.ts.
  if (restaurant_id) where.restaurant_id = restaurant_id;

  // A user's actor sheet can go missing out from under its row (e.g. deleted in
  // Drive) without the users table being updated — don't let one bad sheet 500
  // the whole listing for every admin.
  const perUser = await Promise.all(
    users.map(async (user) => {
      const ctx = userContext(user.user_id as string, user.actor_sheet_id as string);
      try {
        const reservations = await ctx.table('reservations').findMany({ where }) as Record<string, unknown>[];
        return reservations.map((b) => withOwner(b, user));
      } catch (err) {
        console.error(`admin/reservations: failed to read reservations for user ${user.user_id as string}:`, err);
        return [];
      }
    })
  );

  const all = perUser.flat().sort((a, b) => String(b._created_at).localeCompare(String(a._created_at)));

  const total = all.length;
  const page  = all.slice(offset, offset + limit);

  return { reservations: page, total, limit, offset };
}

export async function getById(id: string, userId: string) {
  const user = await findUser(userId);
  const ctx  = userContext(userId, user.actor_sheet_id as string);

  const reservation = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown> | null;
  if (!reservation) {
    throw new AppError(404, 'Reservation not found');
  }

  return withOwner(reservation, user);
}

export async function updateStatus(id: string, userId: string, status: string) {
  const validStatuses = Object.keys(TRANSITIONS);
  if (!status || !validStatuses.includes(status)) {
    throw new AppError(400, `status must be one of: ${validStatuses.join(', ')}`);
  }
  if (status === 'forwarded') {
    throw new AppError(400, 'Use POST /admin/reservations/:id/forwards to forward a booking');
  }

  const user = await findUser(userId);
  const ctx  = userContext(userId, user.actor_sheet_id as string);

  const reservation = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown> | null;
  if (!reservation) {
    throw new AppError(404, 'Reservation not found');
  }

  const allowed = TRANSITIONS[reservation.status as string] ?? [];
  if (!allowed.includes(status)) {
    throw new AppError(409, `Cannot transition reservation from ${reservation.status as string} to ${status}`);
  }

  await ctx.table('reservations').update({ where: { reservation_id: id }, data: { status } });

  if (status === 'cancelled') {
    await restockIfProduct(reservation.restaurant_id as string, reservation.service_id as string);
  }

  const updated = await ctx.table('reservations').findOne({ where: { reservation_id: id } }) as Record<string, unknown>;
  return withOwner(updated, user);
}
