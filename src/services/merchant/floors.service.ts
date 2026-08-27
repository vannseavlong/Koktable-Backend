import * as floorsService from '../floors.service';
import type { FloorInput } from '../floors.service';

// Every query/mutation here is scoped to the merchant's own restaurant_id (resolved
// from the JWT by the controller) — a merchant can never read or write another
// restaurant's floors, regardless of what floor_id a client passes in.

interface ListFloorsQuery {
  location_id?: string;
  active?: boolean;
}

export async function list(restaurantId: string, query: ListFloorsQuery) {
  const floors = await floorsService.list({ restaurant_id: restaurantId, ...query });
  return { floors };
}

export async function getById(restaurantId: string, id: string) {
  return floorsService.getOwned(id, restaurantId);
}

export async function create(restaurantId: string, body: FloorInput) {
  return floorsService.create(restaurantId, body);
}

export async function update(restaurantId: string, id: string, body: FloorInput) {
  return floorsService.update(id, restaurantId, body);
}

export async function remove(restaurantId: string, id: string) {
  await floorsService.remove(id, restaurantId);
}
