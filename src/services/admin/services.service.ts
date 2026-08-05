import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

interface ListServicesQuery {
  active?: boolean;
  category_id?: string;
}

interface ServiceInput {
  name?: string;
  description?: string;
  price_from?: number;
  icon?: string;
  color?: string;
  category_id?: string;
  active?: boolean;
  sort_order?: number;
}

function validateCreate(body: ServiceInput): string | null {
  if (!body.name)             return 'name is required';
  if (body.price_from == null) return 'price_from is required';
  if (Number(body.price_from) < 0) return 'price_from must be >= 0';
  if (!body.icon)             return 'icon is required';
  if (!body.color)            return 'color is required';
  if (!body.category_id)      return 'category_id is required';
  return null;
}

export async function list(query: ListServicesQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.active !== undefined) where.active = query.active;
  if (query.category_id)          where.category_id = query.category_id;

  const services = await ctx.table('services').findMany({ where, orderBy: 'sort_order', order: 'asc' });
  return { services };
}

export async function getById(id: string) {
  const ctx     = adminContext();
  const service = await ctx.table('services').findOne({ where: { service_id: id } });
  if (!service) {
    throw new AppError(404, 'Service not found');
  }
  return service;
}

export async function create(body: ServiceInput) {
  const error = validateCreate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const ctx        = adminContext();
  const service_id = `svc_${nanoid(10)}`;

  await ctx.table('services').create({
    service_id,
    name:        body.name,
    description: body.description ?? '',
    price_from:  Number(body.price_from),
    icon:        body.icon,
    color:       body.color,
    category_id: body.category_id,
    active:      body.active ?? true,
    sort_order:  body.sort_order ?? 0,
  });

  return getById(service_id);
}

export async function update(id: string, body: ServiceInput) {
  const ctx = adminContext();
  const existing = await ctx.table('services').findOne({ where: { service_id: id } });
  if (!existing) {
    throw new AppError(404, 'Service not found');
  }

  if (body.price_from !== undefined && Number(body.price_from) < 0) {
    throw new AppError(400, 'price_from must be >= 0');
  }

  const data: Record<string, unknown> = {};
  if (body.name        !== undefined) data.name        = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.price_from  !== undefined) data.price_from  = Number(body.price_from);
  if (body.icon        !== undefined) data.icon        = body.icon;
  if (body.color       !== undefined) data.color       = body.color;
  if (body.category_id !== undefined) data.category_id = body.category_id;
  if (body.active      !== undefined) data.active      = body.active;
  if (body.sort_order  !== undefined) data.sort_order  = body.sort_order;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('services').update({ where: { service_id: id }, data });
  return getById(id);
}

export async function remove(id: string) {
  const ctx = adminContext();
  const existing = await ctx.table('services').findOne({ where: { service_id: id } });
  if (!existing) {
    throw new AppError(404, 'Service not found');
  }

  await ctx.table('services').delete({ where: { service_id: id } });
}

export async function reorder(order: unknown) {
  if (!Array.isArray(order) || order.length === 0 || !order.every((id) => typeof id === 'string')) {
    throw new AppError(400, 'order must be a non-empty array of service_id strings');
  }

  const ctx = adminContext();
  await Promise.all(
    order.map((service_id: string, index: number) =>
      ctx.table('services').update({ where: { service_id }, data: { sort_order: index } })
    )
  );

  return list({});
}
