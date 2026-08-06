import { nanoid } from 'nanoid';
import { adminContext, userContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { findUser } from '../shared/reservationLookup';

// Overview.md §1.1: "no response in 2 hours triggers a follow-up call".
const SLA_HOURS = 2;
const CHANNELS = ['telegram', 'email', 'call'];
// A booking can only be forwarded while it's still actionable — not once a restaurant
// (registered or otherwise) has already confirmed/started/finished/cancelled it.
const FORWARDABLE_STATUSES = ['pending', 'forwarded'];

interface CreateForwardInput {
  user_id?: string;
  restaurant_id?: string;
  target_name?: string;
  target_contact?: string;
  channel?: string;
  message?: string;
}

export async function list(reservationId: string) {
  const ctx = adminContext();
  const forwards = await ctx.table('reservation_forwards').findMany({
    where:   { reservation_id: reservationId },
    orderBy: 'sent_at',
    order:   'desc',
  });
  return { forwards };
}

export async function create(reservationId: string, sentBy: string, input: CreateForwardInput) {
  if (!input.user_id)     throw new AppError(400, 'user_id is required');
  if (!input.target_name) throw new AppError(400, 'target_name is required');
  if (!input.channel || !CHANNELS.includes(input.channel)) {
    throw new AppError(400, `channel must be one of: ${CHANNELS.join(', ')}`);
  }

  const user = await findUser(input.user_id);
  const uCtx = userContext(input.user_id, user.actor_sheet_id as string);

  const reservation = await uCtx.table('reservations').findOne({ where: { reservation_id: reservationId } }) as Record<string, unknown> | null;
  if (!reservation) {
    throw new AppError(404, 'Reservation not found');
  }
  if (!FORWARDABLE_STATUSES.includes(reservation.status as string)) {
    throw new AppError(409, `Cannot forward a reservation with status '${reservation.status as string}'`);
  }

  const now = new Date();
  const forward_id = `fwd_${nanoid(10)}`;
  const ctx = adminContext();
  await ctx.table('reservation_forwards').create({
    forward_id,
    reservation_id: reservationId,
    user_id:        input.user_id,
    restaurant_id:  input.restaurant_id ?? '',
    target_name:    input.target_name,
    target_contact: input.target_contact ?? '',
    channel:        input.channel,
    message:        input.message ?? '',
    sent_by:        sentBy,
    sent_at:        now.toISOString(),
    sla_due_at:     new Date(now.getTime() + SLA_HOURS * 60 * 60 * 1000).toISOString(),
  });

  if (reservation.status !== 'forwarded') {
    await uCtx.table('reservations').update({ where: { reservation_id: reservationId }, data: { status: 'forwarded' } });
  }

  return ctx.table('reservation_forwards').findOne({ where: { forward_id } });
}
