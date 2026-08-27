import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import * as roomsService from '../rooms.service';
import type { RoomInput, RoomFilters } from '../rooms.service';

interface CreateRoomInput extends RoomInput {
  restaurant_id?: string;
}

async function requireRestaurant(restaurantId: string): Promise<void> {
  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: restaurantId } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }
}

export async function list(query: RoomFilters) {
  const rooms = await roomsService.list(query);
  return { rooms };
}

export async function getById(id: string) {
  return roomsService.getById(id);
}

export async function create(body: CreateRoomInput) {
  if (!body.restaurant_id) {
    throw new AppError(400, 'restaurant_id is required');
  }
  await requireRestaurant(body.restaurant_id);
  return roomsService.create(body.restaurant_id, body);
}

export async function update(id: string, body: RoomInput) {
  const existing = await roomsService.getById(id);
  return roomsService.update(id, existing.restaurant_id as string, body);
}

export async function remove(id: string) {
  const existing = await roomsService.getById(id);
  await roomsService.remove(id, existing.restaurant_id as string);
}
