import { adminContext } from '../lib/adapter';

// Public, unauthenticated read-only view onto the admin-actor `categories` table
// (see src/services/admin/categories.service.ts for the full-access equivalent).
// Only `active: true` rows are customer-visible.
export async function list() {
  const ctx = adminContext();
  const categories = await ctx.table('categories').findMany({
    where:   { active: true, moderation_status: 'approved' },
    orderBy: 'sort_order',
    order:   'asc',
  });
  return { categories };
}
