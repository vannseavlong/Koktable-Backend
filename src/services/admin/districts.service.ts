import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

interface ListDistrictsQuery {
  active?: boolean;
  city_id?: string;
}

interface DistrictInput {
  city_id?: string;
  name?: string;
  active?: boolean;
  sort_order?: number;
}

function validateCreate(body: DistrictInput): string | null {
  if (!body.name)    return 'name is required';
  if (!body.city_id) return 'city_id is required';
  return null;
}

export async function list(query: ListDistrictsQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.active  !== undefined) where.active  = query.active;
  if (query.city_id !== undefined) where.city_id = query.city_id;

  const districts = await ctx.table('districts').findMany({ where, orderBy: 'sort_order', order: 'asc' });
  return { districts };
}

export async function getById(id: string) {
  const ctx      = adminContext();
  const district = await ctx.table('districts').findOne({ where: { district_id: id } });
  if (!district) {
    throw new AppError(404, 'District not found');
  }
  return district;
}

async function requireCity(cityId: string): Promise<void> {
  const ctx  = adminContext();
  const city = await ctx.table('cities').findOne({ where: { city_id: cityId } });
  if (!city) {
    throw new AppError(422, `city_id '${cityId}' does not exist`);
  }
}

export async function create(body: DistrictInput) {
  const error = validateCreate(body);
  if (error) {
    throw new AppError(400, error);
  }
  await requireCity(body.city_id as string);

  const ctx         = adminContext();
  const district_id = `dist_${nanoid(10)}`;

  await ctx.table('districts').create({
    district_id,
    city_id:    body.city_id,
    name:       body.name,
    active:     body.active ?? true,
    sort_order: body.sort_order ?? 0,
  });

  return getById(district_id);
}

export async function update(id: string, body: DistrictInput) {
  const ctx = adminContext();
  const existing = await ctx.table('districts').findOne({ where: { district_id: id } });
  if (!existing) {
    throw new AppError(404, 'District not found');
  }
  if (body.city_id !== undefined) {
    await requireCity(body.city_id);
  }

  const data: Record<string, unknown> = {};
  if (body.city_id    !== undefined) data.city_id    = body.city_id;
  if (body.name       !== undefined) data.name       = body.name;
  if (body.active     !== undefined) data.active     = body.active;
  if (body.sort_order !== undefined) data.sort_order = body.sort_order;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('districts').update({ where: { district_id: id }, data });
  return getById(id);
}

export async function remove(id: string) {
  const ctx = adminContext();
  const existing = await ctx.table('districts').findOne({ where: { district_id: id } });
  if (!existing) {
    throw new AppError(404, 'District not found');
  }

  await ctx.table('districts').delete({ where: { district_id: id } });
}

export async function reorder(order: unknown) {
  if (!Array.isArray(order) || order.length === 0 || !order.every((id) => typeof id === 'string')) {
    throw new AppError(400, 'order must be a non-empty array of district_id strings');
  }

  const ctx = adminContext();
  await Promise.all(
    order.map((district_id: string, index: number) =>
      ctx.table('districts').update({ where: { district_id }, data: { sort_order: index } })
    )
  );

  return list({});
}
