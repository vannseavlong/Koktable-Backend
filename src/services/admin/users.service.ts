import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

interface ListUsersQuery {
  status?: string;
  role?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

interface UpdateUserStatusInput {
  status?: string;
}

const VALID_STATUSES = ['active', 'inactive'];

function matchesSearch(user: Record<string, unknown>, search: string): boolean {
  const needle = search.toLowerCase();
  return (
    String(user.email ?? '').toLowerCase().includes(needle) ||
    String(user.full_name ?? '').toLowerCase().includes(needle)
  );
}

export async function list(query: ListUsersQuery) {
  const ctx = adminContext();
  const limit  = Math.min(query.limit ?? 50, 100);
  const offset = query.offset ?? 0;

  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;
  if (query.role)   where.role   = query.role;

  let users = await ctx.table('users').findMany({ where, orderBy: '_created_at', order: 'desc' }) as Record<string, unknown>[];

  if (query.search) {
    users = users.filter((u) => matchesSearch(u, query.search as string));
  }

  const total = users.length;
  const page  = users.slice(offset, offset + limit);

  return { users: page, total, limit, offset };
}

export async function getById(id: string) {
  const ctx  = adminContext();
  const user = await ctx.table('users').findOne({ where: { user_id: id } });
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user;
}

export async function updateStatus(id: string, input: UpdateUserStatusInput) {
  const { status } = input;
  if (!status || !VALID_STATUSES.includes(status)) {
    throw new AppError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const ctx = adminContext();
  const existing = await ctx.table('users').findOne({ where: { user_id: id } });
  if (!existing) {
    throw new AppError(404, 'User not found');
  }

  await ctx.table('users').update({ where: { user_id: id }, data: { status } });
  return ctx.table('users').findOne({ where: { user_id: id } });
}
