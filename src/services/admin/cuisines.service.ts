import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

interface ListCuisinesQuery {
  active?: boolean;
}

interface CuisineInput {
  name?: string;
  name_zh?: string;
  name_km?: string;
  name_ko?: string;
  icon?: string;
  active?: boolean;
  sort_order?: number;
  moderation_status?: string;
}

function validateCreate(body: CuisineInput): string | null {
  if (!body.name) return 'name is required';
  return null;
}

export async function list(query: ListCuisinesQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.active !== undefined) where.active = query.active;

  const cuisines = await ctx.table('cuisines').findMany({ where, orderBy: 'sort_order', order: 'asc' });
  return { cuisines };
}

export async function getById(id: string) {
  const ctx     = adminContext();
  const cuisine = await ctx.table('cuisines').findOne({ where: { cuisine_id: id } });
  if (!cuisine) {
    throw new AppError(404, 'Cuisine not found');
  }
  return cuisine;
}

export async function create(body: CuisineInput) {
  const error = validateCreate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const ctx        = adminContext();
  const cuisine_id = `cui_${nanoid(10)}`;

  await ctx.table('cuisines').create({
    cuisine_id,
    name:       body.name,
    name_zh:    body.name_zh ?? '',
    name_km:    body.name_km ?? '',
    name_ko:    body.name_ko ?? '',
    icon:       body.icon ?? '',
    active:     body.active ?? true,
    sort_order: body.sort_order ?? 0,
    moderation_status: 'approved',
  });

  return getById(cuisine_id);
}

export async function update(id: string, body: CuisineInput) {
  const ctx = adminContext();
  const existing = await ctx.table('cuisines').findOne({ where: { cuisine_id: id } });
  if (!existing) {
    throw new AppError(404, 'Cuisine not found');
  }

  const data: Record<string, unknown> = {};
  if (body.name       !== undefined) data.name       = body.name;
  if (body.name_zh    !== undefined) data.name_zh    = body.name_zh;
  if (body.name_km    !== undefined) data.name_km    = body.name_km;
  if (body.name_ko    !== undefined) data.name_ko    = body.name_ko;
  if (body.icon       !== undefined) data.icon       = body.icon;
  if (body.active     !== undefined) data.active     = body.active;
  if (body.sort_order !== undefined) data.sort_order = body.sort_order;
  if (body.moderation_status !== undefined) {
    if (!['approved', 'pending', 'rejected'].includes(body.moderation_status)) {
      throw new AppError(400, 'moderation_status must be one of: approved, pending, rejected');
    }
    data.moderation_status = body.moderation_status;
  }

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('cuisines').update({ where: { cuisine_id: id }, data });
  return getById(id);
}

export async function remove(id: string) {
  const ctx = adminContext();
  const existing = await ctx.table('cuisines').findOne({ where: { cuisine_id: id } });
  if (!existing) {
    throw new AppError(404, 'Cuisine not found');
  }

  await ctx.table('cuisines').delete({ where: { cuisine_id: id } });
}

export async function reorder(order: unknown) {
  if (!Array.isArray(order) || order.length === 0 || !order.every((id) => typeof id === 'string')) {
    throw new AppError(400, 'order must be a non-empty array of cuisine_id strings');
  }

  const ctx = adminContext();
  await Promise.all(
    order.map((cuisine_id: string, index: number) =>
      ctx.table('cuisines').update({ where: { cuisine_id }, data: { sort_order: index } })
    )
  );

  return list({});
}
