import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

interface ListCategoriesQuery {
  active?: boolean;
}

interface CategoryInput {
  name?: string;
  icon?: string;
  active?: boolean;
  sort_order?: number;
}

function validateCreate(body: CategoryInput): string | null {
  if (!body.name) return 'name is required';
  return null;
}

export async function list(query: ListCategoriesQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.active !== undefined) where.active = query.active;

  const categories = await ctx.table('categories').findMany({ where, orderBy: 'sort_order', order: 'asc' });
  return { categories };
}

export async function getById(id: string) {
  const ctx      = adminContext();
  const category = await ctx.table('categories').findOne({ where: { category_id: id } });
  if (!category) {
    throw new AppError(404, 'Category not found');
  }
  return category;
}

export async function create(body: CategoryInput) {
  const error = validateCreate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const ctx         = adminContext();
  const category_id = `cat_${nanoid(10)}`;

  await ctx.table('categories').create({
    category_id,
    name:       body.name,
    icon:       body.icon ?? '',
    active:     body.active ?? true,
    sort_order: body.sort_order ?? 0,
  });

  return getById(category_id);
}

export async function update(id: string, body: CategoryInput) {
  const ctx = adminContext();
  const existing = await ctx.table('categories').findOne({ where: { category_id: id } });
  if (!existing) {
    throw new AppError(404, 'Category not found');
  }

  const data: Record<string, unknown> = {};
  if (body.name       !== undefined) data.name       = body.name;
  if (body.icon       !== undefined) data.icon       = body.icon;
  if (body.active     !== undefined) data.active     = body.active;
  if (body.sort_order !== undefined) data.sort_order = body.sort_order;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('categories').update({ where: { category_id: id }, data });
  return getById(id);
}

export async function remove(id: string) {
  const ctx = adminContext();
  const existing = await ctx.table('categories').findOne({ where: { category_id: id } });
  if (!existing) {
    throw new AppError(404, 'Category not found');
  }

  await ctx.table('categories').delete({ where: { category_id: id } });
}

export async function reorder(order: unknown) {
  if (!Array.isArray(order) || order.length === 0 || !order.every((id) => typeof id === 'string')) {
    throw new AppError(400, 'order must be a non-empty array of category_id strings');
  }

  const ctx = adminContext();
  await Promise.all(
    order.map((category_id: string, index: number) =>
      ctx.table('categories').update({ where: { category_id }, data: { sort_order: index } })
    )
  );

  return list({});
}
