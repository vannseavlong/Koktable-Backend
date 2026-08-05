import { nanoid } from 'nanoid';
import { adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';

interface CreateServiceInput {
  name?: string;
  description?: string;
  price_from?: number;
  icon?: string;
  color?: string;
  category_id?: string;
  sort_order?: number;
}

export async function list() {
  const ctx = adminContext();
  return ctx.table('services').findMany({
    where:   { active: true },
    orderBy: 'sort_order',
    order:   'asc',
  });
}

export async function getById(id: string) {
  const ctx     = adminContext();
  const service = await ctx.table('services').findOne({ where: { service_id: id } });
  if (!service) {
    throw new AppError(404, 'Service not found');
  }
  return service;
}

export async function create(data: CreateServiceInput) {
  const { name, description, price_from, icon, color, category_id, sort_order } = data;

  if (!name || price_from == null || !icon || !color || !category_id) {
    throw new AppError(400, 'name, price_from, icon, color, and category_id are required');
  }

  const ctx        = adminContext();
  const service_id = `svc_${nanoid(8)}`;

  await ctx.table('services').create({
    service_id,
    name,
    description: description ?? '',
    price_from,
    icon,
    color,
    category_id,
    active:     true,
    sort_order: sort_order ?? 0,
  });

  return ctx.table('services').findOne({ where: { service_id } });
}

export async function update(id: string, data: Record<string, unknown>) {
  const ctx      = adminContext();
  const existing = await ctx.table('services').findOne({ where: { service_id: id } });
  if (!existing) {
    throw new AppError(404, 'Service not found');
  }

  await ctx.table('services').update({ where: { service_id: id }, data });
  return ctx.table('services').findOne({ where: { service_id: id } });
}

export async function deactivate(id: string) {
  const ctx      = adminContext();
  const existing = await ctx.table('services').findOne({ where: { service_id: id } });
  if (!existing) {
    throw new AppError(404, 'Service not found');
  }

  await ctx.table('services').update({ where: { service_id: id }, data: { active: false } });
}
