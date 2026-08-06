import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

interface ListCitiesQuery {
  active?: boolean;
}

interface CityInput {
  name?: string;
  active?: boolean;
  sort_order?: number;
}

function validateCreate(body: CityInput): string | null {
  if (!body.name) return 'name is required';
  return null;
}

export async function list(query: ListCitiesQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.active !== undefined) where.active = query.active;

  const cities = await ctx.table('cities').findMany({ where, orderBy: 'sort_order', order: 'asc' });
  return { cities };
}

export async function getById(id: string) {
  const ctx  = adminContext();
  const city = await ctx.table('cities').findOne({ where: { city_id: id } });
  if (!city) {
    throw new AppError(404, 'City not found');
  }
  return city;
}

export async function create(body: CityInput) {
  const error = validateCreate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const ctx     = adminContext();
  const city_id = `city_${nanoid(10)}`;

  await ctx.table('cities').create({
    city_id,
    name:       body.name,
    active:     body.active ?? true,
    sort_order: body.sort_order ?? 0,
  });

  return getById(city_id);
}

export async function update(id: string, body: CityInput) {
  const ctx = adminContext();
  const existing = await ctx.table('cities').findOne({ where: { city_id: id } });
  if (!existing) {
    throw new AppError(404, 'City not found');
  }

  const data: Record<string, unknown> = {};
  if (body.name       !== undefined) data.name       = body.name;
  if (body.active     !== undefined) data.active     = body.active;
  if (body.sort_order !== undefined) data.sort_order = body.sort_order;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('cities').update({ where: { city_id: id }, data });
  return getById(id);
}

export async function remove(id: string) {
  const ctx = adminContext();
  const existing = await ctx.table('cities').findOne({ where: { city_id: id } });
  if (!existing) {
    throw new AppError(404, 'City not found');
  }

  await ctx.table('cities').delete({ where: { city_id: id } });
}

export async function reorder(order: unknown) {
  if (!Array.isArray(order) || order.length === 0 || !order.every((id) => typeof id === 'string')) {
    throw new AppError(400, 'order must be a non-empty array of city_id strings');
  }

  const ctx = adminContext();
  await Promise.all(
    order.map((city_id: string, index: number) =>
      ctx.table('cities').update({ where: { city_id }, data: { sort_order: index } })
    )
  );

  return list({});
}
