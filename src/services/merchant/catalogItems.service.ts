import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { deleteImageBestEffort } from '../../utils/imageUpload';
import {
  validateCatalogItemCreate,
  validateCatalogItemUpdate,
  catalogItemUpdateData,
  type CatalogItemInput,
} from '../../utils/catalogItems';

// Every query/mutation here is scoped to the merchant's own restaurant_id (resolved from
// the JWT by the controller) — a merchant can never read or write another restaurant's
// catalog, regardless of what item_id/restaurant_id a client passes in.

interface ListCatalogItemsQuery {
  item_type?: string;
  active?: boolean;
}

async function findOwned(restaurantId: string, id: string) {
  const ctx  = adminContext();
  const item = await ctx.table('catalog_items').findOne({ where: { item_id: id } }) as Record<string, unknown> | null;
  if (!item || item.restaurant_id !== restaurantId) {
    throw new AppError(404, 'Catalog item not found');
  }
  return item;
}

export async function list(restaurantId: string, query: ListCatalogItemsQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = { restaurant_id: restaurantId };
  if (query.item_type) where.item_type = query.item_type;
  if (query.active !== undefined) where.active = query.active;

  const items = await ctx.table('catalog_items').findMany({ where, orderBy: 'sort_order', order: 'asc' });
  return { items };
}

export async function getById(restaurantId: string, id: string) {
  return findOwned(restaurantId, id);
}

export async function create(restaurantId: string, body: CatalogItemInput) {
  const error = validateCatalogItemCreate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const ctx     = adminContext();
  const item_id = `item_${nanoid(10)}`;

  await ctx.table('catalog_items').create({
    item_id,
    restaurant_id:     restaurantId,
    item_type:   body.item_type ?? 'service',
    name:        body.name,
    description: body.description ?? '',
    price_from:  Number(body.price_from),
    icon:        body.icon ?? '',
    color:       body.color ?? '',
    image:       body.image ?? '',
    category_id: body.category_id ?? '',
    active:      body.active ?? true,
    sort_order:  body.sort_order ?? 0,
    ...(body.quantity       !== undefined ? { quantity: Number(body.quantity) } : {}),
    ...(body.daily_capacity !== undefined ? { daily_capacity: Number(body.daily_capacity) } : {}),
  });

  return findOwned(restaurantId, item_id);
}

export async function update(restaurantId: string, id: string, body: CatalogItemInput) {
  const current = await findOwned(restaurantId, id);

  const error = validateCatalogItemUpdate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const data = catalogItemUpdateData(body);
  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  const ctx = adminContext();
  await ctx.table('catalog_items').update({ where: { item_id: id }, data });

  if ('image' in data && data.image !== current.image) {
    await deleteImageBestEffort(current.image as string | undefined);
  }

  return findOwned(restaurantId, id);
}

export async function remove(restaurantId: string, id: string) {
  const current = await findOwned(restaurantId, id);
  const ctx = adminContext();
  await ctx.table('catalog_items').delete({ where: { item_id: id } });
  await deleteImageBestEffort(current.image as string | undefined);
}
