import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import { DAYS_OF_WEEK, type DayOfWeek, type HoursPeriod } from '../utils/restaurantHours';
import * as restaurantLocationsService from './restaurantLocations.service';

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

// --- Location-scoped (source of truth) --------------------------------------------

export async function getForLocation(locationId: string) {
  const ctx  = adminContext();
  const rows = await ctx.table('restaurant_hours').findMany({ where: { location_id: locationId } }) as Record<string, unknown>[];
  return sortByDay(rows as { day_of_week: string }[]);
}

// One table read total instead of one per location.
export async function getForLocations(locationIds: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const ctx  = adminContext();
  const all  = await ctx.table('restaurant_hours').findMany({}) as Record<string, unknown>[];
  const ids  = new Set(locationIds);
  const byLocation = new Map<string, Record<string, unknown>[]>();
  for (const row of all) {
    const locationId = row.location_id as string;
    if (!ids.has(locationId)) continue;
    if (!byLocation.has(locationId)) byLocation.set(locationId, []);
    byLocation.get(locationId)!.push(row);
  }
  for (const [id, rows] of byLocation) {
    byLocation.set(id, sortByDay(rows as { day_of_week: string }[]));
  }
  return byLocation;
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

// Replace-all: deletes the location's existing rows and writes `days` fresh.
export async function setForLocation(locationId: string, days: DayHoursInput[]) {
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
  const location = await ctx.table('restaurant_locations').findOne({ where: { location_id: locationId } }) as Record<string, unknown> | null;
  if (!location) {
    throw new AppError(404, 'Location not found');
  }
  const restaurantId = location.restaurant_id as string;

  await ctx.table('restaurant_hours').delete({ where: { location_id: locationId } });

  for (const day of days) {
    await ctx.table('restaurant_hours').create({
      hours_id:      `hrs_${locationId}_${day.day_of_week}`,
      restaurant_id: restaurantId,
      location_id:   locationId,
      day_of_week:   day.day_of_week,
      closed:        day.closed ?? false,
      open_24h:      day.open_24h ?? false,
      periods:       day.periods ?? [],
    });
  }

  return getForLocation(locationId);
}

// --- Restaurant-scoped convenience wrappers ----------------------------------------
// A restaurant's hours are the flattened union of its location(s)' hours. Every
// restaurant has exactly one location today (see restaurantLocations.service.ts's
// getPrimary()), so this is a straight pass-through kept around for callers that still
// think in restaurant terms: the public `restaurants.service.ts` mirror and
// `merchant/restaurant.service.ts`'s single-primary-location `getOwn()` (its
// `updateOwnHours()` writes via `setForLocation` directly against the resolved primary
// location — see there). `admin/restaurants.service.ts` does NOT use these: it embeds
// hours per-location instead of flattening them onto the restaurant (see there for why).

export async function getForRestaurant(restaurantId: string) {
  const locations = await restaurantLocationsService.getForRestaurant(restaurantId);
  const locationIds = locations.map((l) => l.location_id as string);
  if (locationIds.length === 0) return [];
  const byLocation = await getForLocations(locationIds);
  const hours = locationIds.flatMap((id) => byLocation.get(id) ?? []);
  return sortByDay(hours as { day_of_week: string }[]);
}

// One table read (each, for hours and for locations) total instead of one per restaurant.
export async function getForRestaurants(restaurantIds: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const locationsByRestaurant = await restaurantLocationsService.getForRestaurants(restaurantIds);
  const allLocationIds = [...locationsByRestaurant.values()].flatMap((locs) => locs.map((l) => l.location_id as string));
  const byLocation = await getForLocations(allLocationIds);

  const byRestaurant = new Map<string, Record<string, unknown>[]>();
  for (const restaurantId of restaurantIds) {
    const locations = locationsByRestaurant.get(restaurantId) ?? [];
    const hours = locations.flatMap((l) => byLocation.get(l.location_id as string) ?? []);
    byRestaurant.set(restaurantId, sortByDay(hours as { day_of_week: string }[]));
  }
  return byRestaurant;
}
