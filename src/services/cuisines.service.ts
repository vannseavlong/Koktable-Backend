import { adminContext } from '../lib/adapter';

// Public, unauthenticated read-only view onto the admin-actor `cuisines` table
// (see src/services/admin/cuisines.service.ts for the full-access equivalent).
// Only `active: true` rows are customer-visible.
export async function list() {
  const ctx = adminContext();
  const cuisines = await ctx.table('cuisines').findMany({
    where:   { active: true },
    orderBy: 'sort_order',
    order:   'asc',
  });
  return { cuisines };
}
