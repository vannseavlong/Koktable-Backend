import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import * as tablesService from '../tables.service';
import type { TableInput, TableFilters } from '../tables.service';

interface CreateTableInput extends TableInput {
  restaurant_id?: string;
}

async function requireRestaurant(restaurantId: string): Promise<void> {
  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: restaurantId } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }
}

export async function list(query: TableFilters) {
  const tables = await tablesService.list(query);
  return { tables };
}

export async function getById(id: string) {
  return tablesService.getById(id);
}

export async function create(body: CreateTableInput) {
  if (!body.restaurant_id) {
    throw new AppError(400, 'restaurant_id is required');
  }
  await requireRestaurant(body.restaurant_id);
  return tablesService.create(body.restaurant_id, body);
}

export async function update(id: string, body: TableInput) {
  const existing = await tablesService.getById(id);
  return tablesService.update(id, existing.restaurant_id as string, body);
}

export async function remove(id: string) {
  const existing = await tablesService.getById(id);
  await tablesService.remove(id, existing.restaurant_id as string);
}
