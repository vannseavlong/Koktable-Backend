export const CATALOG_ITEM_TYPES = ['service', 'product'];

export interface CatalogItemInput {
  name?: string;
  name_zh?: string;
  name_km?: string;
  name_ko?: string;
  description?: string;
  description_zh?: string;
  description_km?: string;
  description_ko?: string;
  item_type?: string;
  price_from?: number;
  icon?: string;
  color?: string;
  image?: string;
  category_id?: string;
  active?: boolean;
  sort_order?: number;
  quantity?: number;
  daily_capacity?: number;
}

function validateStockFields(body: CatalogItemInput): string | null {
  if (body.quantity !== undefined && Number(body.quantity) < 0) return 'quantity must be >= 0';
  if (body.daily_capacity !== undefined && Number(body.daily_capacity) < 0) return 'daily_capacity must be >= 0';
  return null;
}

export function validateCatalogItemCreate(body: CatalogItemInput): string | null {
  if (!body.name) return 'name is required';
  if (body.price_from == null) return 'price_from is required';
  if (Number(body.price_from) < 0) return 'price_from must be >= 0';
  if (body.item_type && !CATALOG_ITEM_TYPES.includes(body.item_type)) {
    return `item_type must be one of: ${CATALOG_ITEM_TYPES.join(', ')}`;
  }
  return validateStockFields(body);
}

export function validateCatalogItemUpdate(body: CatalogItemInput): string | null {
  if (body.price_from !== undefined && Number(body.price_from) < 0) return 'price_from must be >= 0';
  if (body.item_type !== undefined && !CATALOG_ITEM_TYPES.includes(body.item_type)) {
    return `item_type must be one of: ${CATALOG_ITEM_TYPES.join(', ')}`;
  }
  return validateStockFields(body);
}

export function catalogItemUpdateData(body: CatalogItemInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (body.name           !== undefined) data.name           = body.name;
  if (body.name_zh        !== undefined) data.name_zh        = body.name_zh;
  if (body.name_km        !== undefined) data.name_km        = body.name_km;
  if (body.name_ko        !== undefined) data.name_ko        = body.name_ko;
  if (body.description    !== undefined) data.description    = body.description;
  if (body.description_zh !== undefined) data.description_zh = body.description_zh;
  if (body.description_km !== undefined) data.description_km = body.description_km;
  if (body.description_ko !== undefined) data.description_ko = body.description_ko;
  if (body.item_type      !== undefined) data.item_type      = body.item_type;
  if (body.price_from     !== undefined) data.price_from     = Number(body.price_from);
  if (body.icon           !== undefined) data.icon           = body.icon;
  if (body.color          !== undefined) data.color          = body.color;
  if (body.image          !== undefined) data.image          = body.image;
  if (body.category_id    !== undefined) data.category_id    = body.category_id;
  if (body.active         !== undefined) data.active         = body.active;
  if (body.sort_order     !== undefined) data.sort_order     = body.sort_order;
  if (body.quantity       !== undefined) data.quantity       = Number(body.quantity);
  if (body.daily_capacity !== undefined) data.daily_capacity = Number(body.daily_capacity);
  return data;
}
