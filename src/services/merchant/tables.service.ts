import * as tablesService from '../tables.service';
import type { TableInput } from '../tables.service';

// Every query/mutation here is scoped to the merchant's own restaurant_id (resolved
// from the JWT by the controller) — a merchant can never read or write another
// restaurant's tables, regardless of what table_id/room_id a client passes in.

interface ListTablesQuery {
  location_id?: string;
  room_id?: string;
  active?: boolean;
}

export async function list(restaurantId: string, query: ListTablesQuery) {
  const tables = await tablesService.list({ restaurant_id: restaurantId, ...query });
  return { tables };
}

export async function getById(restaurantId: string, id: string) {
  return tablesService.getOwned(id, restaurantId);
}

export async function create(restaurantId: string, body: TableInput) {
  return tablesService.create(restaurantId, body);
}

export async function update(restaurantId: string, id: string, body: TableInput) {
  return tablesService.update(id, restaurantId, body);
}

export async function remove(restaurantId: string, id: string) {
  await tablesService.remove(id, restaurantId);
}
