import { adminContext } from '../lib/adapter';

// Public, unauthenticated read-only view onto the admin-actor `plans` table (see
// src/services/admin/plans.service.ts for the full-access equivalent). Only
// `active: true` rows are visible — same convention as cuisines.service.ts. Used by
// the merchant My Billing page (via /merchant, which has no separate plans route of
// its own) and available for a future public pricing page.
export async function list() {
  const ctx = adminContext();
  const plans = await ctx.table('plans').findMany({
    where:   { active: true },
    orderBy: 'sort_order',
    order:   'asc',
  });
  return { plans };
}
