import * as roomsService from '../rooms.service';
import type { RoomInput } from '../rooms.service';

// Every query/mutation here is scoped to the merchant's own restaurant_id (resolved
// from the JWT by the controller) — a merchant can never read or write another
// restaurant's rooms, regardless of what room_id/floor_id a client passes in.

interface ListRoomsQuery {
  location_id?: string;
  floor_id?: string;
  active?: boolean;
}

export async function list(restaurantId: string, query: ListRoomsQuery) {
  const rooms = await roomsService.list({ restaurant_id: restaurantId, ...query });
  return { rooms };
}

export async function getById(restaurantId: string, id: string) {
  return roomsService.getOwned(id, restaurantId);
}

export async function create(restaurantId: string, body: RoomInput) {
  return roomsService.create(restaurantId, body);
}

export async function update(restaurantId: string, id: string, body: RoomInput) {
  return roomsService.update(id, restaurantId, body);
}

export async function remove(restaurantId: string, id: string) {
  await roomsService.remove(id, restaurantId);
}
