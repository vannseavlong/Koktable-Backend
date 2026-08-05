import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import {
  validateCatalogItemCreate,
  validateCatalogItemUpdate,
  catalogItemUpdateData,
  type CatalogItemInput,
} from '../../utils/catalogItems';

interface ListCatalogItemsQuery {
  restaurant_id?: string;
  item_type?: string;
  active?: boolean;
}

interface CreateCatalogItemInput extends CatalogItemInput {
  restaurant_id?: string;
}

export async function list(query: ListCatalogItemsQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.restaurant_id)   where.restaurant_id = query.restaurant_id;
  if (query.item_type) where.item_type = query.item_type;
  if (query.active !== undefined) where.active = query.active;

  const items = await ctx.table('catalog_items').findMany({ where, orderBy: 'sort_order', order: 'asc' });
  return { items };
}

export async function getById(id: string) {
  const ctx  = adminContext();
  const item = await ctx.table('catalog_items').findOne({ where: { item_id: id } });
  if (!item) {
    throw new AppError(404, 'Catalog item not found');
  }
  return item;
}

export async function create(body: CreateCatalogItemInput) {
  if (!body.restaurant_id) {
    throw new AppError(400, 'restaurant_id is required');
  }

  const ctx  = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: body.restaurant_id } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }

  const error = validateCatalogItemCreate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const item_id = `item_${nanoid(10)}`;
  await ctx.table('catalog_items').create({
    item_id,
    restaurant_id:     body.restaurant_id,
    item_type:   body.item_type ?? 'service',
    name:        body.name,
    description: body.description ?? '',
    price_from:  Number(body.price_from),
    icon:        body.icon ?? '',
    color:       body.color ?? '',
    category_id: body.category_id ?? '',
    active:      body.active ?? true,
    sort_order:  body.sort_order ?? 0,
    ...(body.quantity       !== undefined ? { quantity: Number(body.quantity) } : {}),
    ...(body.daily_capacity !== undefined ? { daily_capacity: Number(body.daily_capacity) } : {}),
  });

  return getById(item_id);
}

export async function update(id: string, body: CatalogItemInput) {
  const ctx      = adminContext();
  const existing = await ctx.table('catalog_items').findOne({ where: { item_id: id } });
  if (!existing) {
    throw new AppError(404, 'Catalog item not found');
  }

  const error = validateCatalogItemUpdate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const data = catalogItemUpdateData(body);
  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('catalog_items').update({ where: { item_id: id }, data });
  return getById(id);
}

export async function remove(id: string) {
  const ctx      = adminContext();
  const existing = await ctx.table('catalog_items').findOne({ where: { item_id: id } });
  if (!existing) {
    throw new AppError(404, 'Catalog item not found');
  }

  await ctx.table('catalog_items').delete({ where: { item_id: id } });
}
