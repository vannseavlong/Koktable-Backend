import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import { DAYS_OF_WEEK, type DayOfWeek, type HoursPeriod } from '../utils/restaurantHours';

export interface DayHoursInput {
  day_of_week: DayOfWeek;
  closed?: boolean;
  open_24h?: boolean;
  periods?: HoursPeriod[];
}

const dayOrder = new Map<string, number>(DAYS_OF_WEEK.map((d, i) => [d, i]));
function sortByDay<T extends { day_of_week: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (dayOrder.get(a.day_of_week) ?? 0) - (dayOrder.get(b.day_of_week) ?? 0));
}

export async function getForRestaurant(restaurantId: string) {
  const ctx  = adminContext();
  const rows = await ctx.table('restaurant_hours').findMany({ where: { restaurant_id: restaurantId } }) as Record<string, unknown>[];
  return sortByDay(rows as { day_of_week: string }[]);
}

// One table read total instead of one per restaurant.
export async function getForRestaurants(restaurantIds: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const ctx  = adminContext();
  const all  = await ctx.table('restaurant_hours').findMany({}) as Record<string, unknown>[];
  const ids  = new Set(restaurantIds);
  const byRestaurant = new Map<string, Record<string, unknown>[]>();
  for (const row of all) {
    const restaurantId = row.restaurant_id as string;
    if (!ids.has(restaurantId)) continue;
    if (!byRestaurant.has(restaurantId)) byRestaurant.set(restaurantId, []);
    byRestaurant.get(restaurantId)!.push(row);
  }
  for (const [id, rows] of byRestaurant) {
    byRestaurant.set(id, sortByDay(rows as { day_of_week: string }[]));
  }
  return byRestaurant;
}

function validateDayInput(day: DayHoursInput): string | null {
  if (!DAYS_OF_WEEK.includes(day.day_of_week)) {
    return `day_of_week must be one of: ${DAYS_OF_WEEK.join(', ')}`;
  }
  if (day.closed && day.open_24h) {
    return `${day.day_of_week}: cannot be both closed and open_24h`;
  }
  if (!day.closed && !day.open_24h && (!day.periods || day.periods.length === 0)) {
    return `${day.day_of_week}: periods is required unless closed or open_24h`;
  }
  for (const p of day.periods ?? []) {
    if (!/^\d{2}:\d{2}$/.test(p.open) || !/^\d{2}:\d{2}$/.test(p.close)) {
      return `${day.day_of_week}: periods must use 24h "HH:mm" times`;
    }
  }
  return null;
}

// Replace-all: deletes the restaurant's existing rows and writes `days` fresh.
export async function setForRestaurant(restaurantId: string, days: DayHoursInput[]) {
  if (days.length === 0) {
    throw new AppError(400, 'At least one day is required');
  }
  const seen = new Set<string>();
  for (const day of days) {
    const error = validateDayInput(day);
    if (error) throw new AppError(400, error);
    if (seen.has(day.day_of_week)) {
      throw new AppError(400, `Duplicate day_of_week: ${day.day_of_week}`);
    }
    seen.add(day.day_of_week);
  }

  const ctx = adminContext();
  await ctx.table('restaurant_hours').delete({ where: { restaurant_id: restaurantId } });

  for (const day of days) {
    await ctx.table('restaurant_hours').create({
      hours_id:      `hrs_${restaurantId}_${day.day_of_week}`,
      restaurant_id: restaurantId,
      day_of_week:   day.day_of_week,
      closed:        day.closed ?? false,
      open_24h:      day.open_24h ?? false,
      periods:       day.periods ?? [],
    });
  }

  return getForRestaurant(restaurantId);
}
