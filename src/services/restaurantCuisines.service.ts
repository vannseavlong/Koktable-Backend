import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';

async function cuisineNameById(): Promise<Map<string, string>> {
  const ctx = adminContext();
  const cuisines = await ctx.table('cuisines').findMany({}) as Record<string, unknown>[];
  return new Map(cuisines.map((c) => [c.cuisine_id as string, c.name as string]));
}

async function cuisineIdByName(): Promise<Map<string, string>> {
  const ctx = adminContext();
  const cuisines = await ctx.table('cuisines').findMany({}) as Record<string, unknown>[];
  return new Map(cuisines.map((c) => [c.name as string, c.cuisine_id as string]));
}

export async function getForRestaurant(restaurantId: string): Promise<string[]> {
  const ctx = adminContext();
  const [rows, nameById] = await Promise.all([
    ctx.table('restaurant_cuisines').findMany({ where: { restaurant_id: restaurantId } }) as Promise<Record<string, unknown>[]>,
    cuisineNameById(),
  ]);
  return rows
    .map((r) => nameById.get(r.cuisine_id as string))
    .filter((name): name is string => name !== undefined);
}

// One table read (each) total instead of one per restaurant.
export async function getForRestaurants(restaurantIds: string[]): Promise<Map<string, string[]>> {
  const ctx = adminContext();
  const [all, nameById] = await Promise.all([
    ctx.table('restaurant_cuisines').findMany({}) as Promise<Record<string, unknown>[]>,
    cuisineNameById(),
  ]);
  const ids = new Set(restaurantIds);
  const byRestaurant = new Map<string, string[]>();
  for (const row of all) {
    const restaurantId = row.restaurant_id as string;
    if (!ids.has(restaurantId)) continue;
    const name = nameById.get(row.cuisine_id as string);
    if (name === undefined) continue;
    if (!byRestaurant.has(restaurantId)) byRestaurant.set(restaurantId, []);
    byRestaurant.get(restaurantId)!.push(name);
  }
  return byRestaurant;
}

// Replace-all: deletes the restaurant's existing rows and writes `cuisineNames` fresh.
// Each name must match an existing cuisines.name exactly — no auto-create, same
// "add it to the canonical list first" convention as category_id elsewhere in this API.
export async function setForRestaurant(restaurantId: string, cuisineNames: string[]): Promise<string[]> {
  const cleaned = [...new Set(cuisineNames.map((c) => c.trim()).filter(Boolean))];
  if (cleaned.length === 0) {
    throw new AppError(400, 'At least one cuisine is required');
  }

  const idByName = await cuisineIdByName();
  const unknown = cleaned.filter((name) => !idByName.has(name));
  if (unknown.length > 0) {
    throw new AppError(400, `Unknown cuisine(s): ${unknown.join(', ')}`);
  }

  const ctx = adminContext();
  await ctx.table('restaurant_cuisines').delete({ where: { restaurant_id: restaurantId } });

  for (const name of cleaned) {
    const cuisine_id = idByName.get(name)!;
    await ctx.table('restaurant_cuisines').create({
      restaurant_cuisine_id: `rc_${restaurantId}_${cuisine_id}`,
      restaurant_id: restaurantId,
      cuisine_id,
    });
  }

  return getForRestaurant(restaurantId);
}
