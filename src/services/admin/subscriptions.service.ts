import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

// Free trial length on approval (Overview.md §7.2: "free trial of Pro, for example 30
// to 60 days"). A restaurant starts on Pro during the trial, not Basic — the schema's
// own `tier` column default of 'basic' is just a fallback for a row created without
// going through ensureForRestaurant(), not the actual business default.
export const TRIAL_DAYS = 30;

export interface Subscription {
  subscription_id: string;
  restaurant_id: string;
  tier: 'basic' | 'pro';
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  billing_interval: 'monthly' | 'annual';
  trial_ends_at?: string;
  current_period_start?: string;
  current_period_end?: string;
  commission_rate?: number;
}

function toSubscription(row: Record<string, unknown>): Subscription {
  return row as unknown as Subscription;
}

export async function getForRestaurant(restaurantId: string): Promise<Subscription | null> {
  const ctx = adminContext();
  const row = await ctx.table('subscriptions').findOne({ where: { restaurant_id: restaurantId } }) as Record<string, unknown> | null;
  return row ? toSubscription(row) : null;
}

// One table read total instead of one per restaurant — same batching shape as
// restaurantCuisines.service.ts's getForRestaurants.
export async function getForRestaurants(restaurantIds: string[]): Promise<Map<string, Subscription>> {
  const ctx = adminContext();
  const all = await ctx.table('subscriptions').findMany({}) as Record<string, unknown>[];
  const ids = new Set(restaurantIds);
  const byRestaurant = new Map<string, Subscription>();
  for (const row of all) {
    const restaurantId = row.restaurant_id as string;
    if (ids.has(restaurantId)) byRestaurant.set(restaurantId, toSubscription(row));
  }
  return byRestaurant;
}

// Idempotent get-or-create — called once from merchantApplications.service.ts's
// approve() (where the restaurant is guaranteed to already exist) and directly from
// the admin GET /admin/restaurants/:id/subscription route (where it isn't), hence the
// explicit existence check — a bad :id should 404, not silently create an orphaned row
// (the schema's ref('restaurants.restaurant_id') would also reject it, but with a
// less specific ValidationError instead of this clean 404).
export async function ensureForRestaurant(restaurantId: string): Promise<Subscription> {
  const existing = await getForRestaurant(restaurantId);
  if (existing) return existing;

  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: restaurantId } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }

  const trial_ends_at = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await ctx.table('subscriptions').create({
    subscription_id:  `sub_${nanoid(10)}`,
    restaurant_id:    restaurantId,
    tier:             'pro',
    status:           'trialing',
    billing_interval: 'monthly',
    trial_ends_at,
  });

  return (await getForRestaurant(restaurantId))!;
}

const VALID_TIERS = ['basic', 'pro'] as const;
const VALID_STATUSES = ['trialing', 'active', 'past_due', 'cancelled'] as const;
const VALID_INTERVALS = ['monthly', 'annual'] as const;

interface SetSubscriptionInput {
  tier?: 'basic' | 'pro';
  status?: 'trialing' | 'active' | 'past_due' | 'cancelled';
  billing_interval?: 'monthly' | 'annual';
}

// Admin mutation. Explicit enum checks here (same convention as restaurants.service.ts's
// VALID_STATUSES) rather than relying solely on the schema layer's enum() validation —
// gives a clean 400 with a specific message instead of a generic ValidationError, and
// the fake adapter used in tests doesn't enforce schema-level constraints at all.
export async function setForRestaurant(restaurantId: string, input: SetSubscriptionInput): Promise<Subscription> {
  const subscription = await ensureForRestaurant(restaurantId);

  if (input.tier === undefined && input.status === undefined && input.billing_interval === undefined) {
    throw new AppError(400, 'tier, status, or billing_interval is required');
  }
  if (input.tier !== undefined && !VALID_TIERS.includes(input.tier)) {
    throw new AppError(400, `tier must be one of: ${VALID_TIERS.join(', ')}`);
  }
  if (input.status !== undefined && !VALID_STATUSES.includes(input.status)) {
    throw new AppError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (input.billing_interval !== undefined && !VALID_INTERVALS.includes(input.billing_interval)) {
    throw new AppError(400, `billing_interval must be one of: ${VALID_INTERVALS.join(', ')}`);
  }

  const ctx = adminContext();
  await ctx.table('subscriptions').update({
    where: { subscription_id: subscription.subscription_id },
    data:  {
      ...(input.tier !== undefined && { tier: input.tier }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.billing_interval !== undefined && { billing_interval: input.billing_interval }),
    },
  });

  return (await getForRestaurant(restaurantId))!;
}
