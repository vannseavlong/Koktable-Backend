import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import * as floorsService from '../floors.service';
import type { FloorInput, FloorFilters } from '../floors.service';

interface CreateFloorInput extends FloorInput {
  restaurant_id?: string;
}

async function requireRestaurant(restaurantId: string): Promise<void> {
  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: restaurantId } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }
}

export async function list(query: FloorFilters) {
  const floors = await floorsService.list(query);
  return { floors };
}

export async function getById(id: string) {
  return floorsService.getById(id);
}

export async function create(body: CreateFloorInput) {
  if (!body.restaurant_id) {
    throw new AppError(400, 'restaurant_id is required');
  }
  await requireRestaurant(body.restaurant_id);
  return floorsService.create(body.restaurant_id, body);
}

export async function update(id: string, body: FloorInput) {
  const existing = await floorsService.getById(id);
  return floorsService.update(id, existing.restaurant_id as string, body);
}

export async function remove(id: string) {
  const existing = await floorsService.getById(id);
  await floorsService.remove(id, existing.restaurant_id as string);
}
