import { adminContext, userContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { usersWithSheets } from '../shared/reservationLookup';

export type DashboardRange = 'week' | 'month' | 'quarter';

const RANGE_DAYS: Record<DashboardRange, number> = { week: 7, month: 30, quarter: 90 };
// Trend buckets stay daily up through a month; a full quarter buckets into 7-day chunks
// so the chart doesn't render ~90 points.
const TREND_BUCKET_DAYS: Record<DashboardRange, number> = { week: 1, month: 1, quarter: 7 };

const RESERVATION_STATUSES = ['pending', 'waitlisted', 'forwarded', 'confirmed', 'active', 'completed', 'no_show', 'cancelled'] as const;
// 'submitted' added alongside invoices.service.ts's merchant-receipt-upload
// auto-transition (see ADMIN_API.md § "Billing / Invoices") — kept in sync here so a
// submitted invoice still lands in a byStatus bucket instead of the `if (status in
// billingByStatus)` guard below silently dropping it from every total.
const INVOICE_STATUSES = ['pending', 'submitted', 'paid', 'failed', 'refunded'] as const;
const SUBSCRIPTION_TIERS = ['basic', 'pro'] as const;
const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'past_due', 'cancelled'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP_RESTAURANTS_LIMIT = 5;

function toDateOnly(value: unknown): string | null {
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

// Day-of-week from a plain "YYYY-MM-DD" string, computed via Date.UTC so it doesn't
// shift with the server's local timezone.
function dayOfWeek(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function hourFromReservationTime(reservationTime: unknown): number | null {
  if (!reservationTime || typeof reservationTime !== 'string') return null;
  const hour = Number(reservationTime.split(':')[0]);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function emptyByStatus<T extends readonly string[]>(statuses: T): Record<T[number], number> {
  return Object.fromEntries(statuses.map((s) => [s, 0])) as Record<T[number], number>;
}

interface RangeBounds {
  startDate: string; // inclusive, "YYYY-MM-DD"
  days: number;
  bucketDays: number;
}

function rangeBounds(range: DashboardRange): RangeBounds {
  const days = RANGE_DAYS[range];
  const start = new Date(Date.now() - (days - 1) * DAY_MS);
  return { startDate: toDateOnly(start.toISOString())!, days, bucketDays: TREND_BUCKET_DAYS[range] };
}

function buildTrend(dateCounts: Map<string, number>, bounds: RangeBounds): { date: string; count: number }[] {
  const buckets: { date: string; count: number }[] = [];
  const start = new Date(`${bounds.startDate}T00:00:00Z`).getTime();

  for (let offset = 0; offset < bounds.days; offset += bounds.bucketDays) {
    const bucketStart = new Date(start + offset * DAY_MS);
    let count = 0;
    for (let i = 0; i < bounds.bucketDays && offset + i < bounds.days; i++) {
      const day = toDateOnly(new Date(bucketStart.getTime() + i * DAY_MS).toISOString())!;
      count += dateCounts.get(day) ?? 0;
    }
    buckets.push({ date: toDateOnly(bucketStart.toISOString())!, count });
  }

  return buckets;
}

// Fans out to every user's actor sheet (same shape as admin/reservations.service.ts's
// list()), but reads every row unfiltered since aggregation needs the full set, not a page.
async function allReservations(): Promise<Record<string, unknown>[]> {
  const users = await usersWithSheets();
  const perUser = await Promise.all(
    users.map(async (user) => {
      const ctx = userContext(user.user_id as string, user.actor_sheet_id as string);
      try {
        return await ctx.table('reservations').findMany({}) as Record<string, unknown>[];
      } catch (err) {
        console.error(`admin/dashboard: failed to read reservations for user ${user.user_id as string}:`, err);
        return [];
      }
    })
  );
  return perUser.flat();
}

export async function getOverview(range: DashboardRange) {
  const bounds = rangeBounds(range);
  const reservations = await allReservations();

  const byStatus = emptyByStatus(RESERVATION_STATUSES);
  const dateCounts = new Map<string, number>();
  const peakHours: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const restaurantCounts = new Map<string, number>();

  let total = 0;
  for (const r of reservations) {
    const dateOnly = toDateOnly(r.start_date);
    if (!dateOnly || dateOnly < bounds.startDate) continue;

    total++;
    const status = r.status as string;
    if (status in byStatus) byStatus[status as typeof RESERVATION_STATUSES[number]]++;
    dateCounts.set(dateOnly, (dateCounts.get(dateOnly) ?? 0) + 1);

    const hour = hourFromReservationTime(r.reservation_time);
    if (hour !== null) peakHours[dayOfWeek(dateOnly)][hour]++;

    const restaurantId = r.restaurant_id as string | undefined;
    if (restaurantId) restaurantCounts.set(restaurantId, (restaurantCounts.get(restaurantId) ?? 0) + 1);
  }

  const ctx = adminContext();
  const [restaurantRows, subscriptionRows, invoiceRows] = await Promise.all([
    ctx.table('restaurants').findMany({}) as Promise<Record<string, unknown>[]>,
    ctx.table('subscriptions').findMany({}) as Promise<Record<string, unknown>[]>,
    ctx.table('invoices').findMany({}) as Promise<Record<string, unknown>[]>,
  ]);

  const restaurantNames = new Map(restaurantRows.map((r) => [r.restaurant_id as string, r.name as string]));
  const topRestaurants = [...restaurantCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_RESTAURANTS_LIMIT)
    .map(([restaurant_id, count]) => ({ restaurant_id, name: restaurantNames.get(restaurant_id) ?? restaurant_id, count }));

  const merchantsByTier = emptyByStatus(SUBSCRIPTION_TIERS);
  const merchantsByStatus = emptyByStatus(SUBSCRIPTION_STATUSES);
  for (const s of subscriptionRows) {
    const tier = s.tier as string;
    const status = s.status as string;
    if (tier in merchantsByTier) merchantsByTier[tier as typeof SUBSCRIPTION_TIERS[number]]++;
    if (status in merchantsByStatus) merchantsByStatus[status as typeof SUBSCRIPTION_STATUSES[number]]++;
  }

  const billingByStatus = Object.fromEntries(
    INVOICE_STATUSES.map((s) => [s, { count: 0, amount: 0 }])
  ) as Record<typeof INVOICE_STATUSES[number], { count: number; amount: number }>;
  let totalAmount = 0;
  for (const inv of invoiceRows) {
    const status = inv.status as string;
    const amount = Number(inv.amount) || 0;
    totalAmount += amount;
    if (status in billingByStatus) {
      const bucket = billingByStatus[status as typeof INVOICE_STATUSES[number]];
      bucket.count++;
      bucket.amount += amount;
    }
  }
  const paidAmount = billingByStatus.paid.amount;
  // 'submitted' (a merchant's claimed-paid receipt, not yet admin-confirmed) still
  // reads as outstanding until it's actually marked paid.
  const outstandingAmount =
    billingByStatus.pending.amount + billingByStatus.submitted.amount + billingByStatus.failed.amount;

  return {
    range,
    reservations: {
      total,
      byStatus,
      trend: buildTrend(dateCounts, bounds),
      peakHours,
    },
    topRestaurants,
    billing: {
      byStatus: billingByStatus,
      totalAmount,
      paidAmount,
      outstandingAmount,
    },
    merchants: {
      total: subscriptionRows.length,
      byTier: merchantsByTier,
      byStatus: merchantsByStatus,
    },
  };
}

export const VALID_RANGES: DashboardRange[] = ['week', 'month', 'quarter'];

export function parseRange(value: unknown): DashboardRange {
  if (value === undefined) return 'month';
  if (typeof value === 'string' && (VALID_RANGES as string[]).includes(value)) return value as DashboardRange;
  throw new AppError(400, `range must be one of: ${VALID_RANGES.join(', ')}`);
}
