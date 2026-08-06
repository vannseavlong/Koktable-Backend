import { adminContext } from '../lib/adapter';

// Public, unauthenticated read-only view onto the admin-actor `cities` table (see
// src/services/admin/cities.service.ts for the full-access equivalent). Only
// `active: true` rows are customer-visible. Backs the "All cities" filter dropdown —
// a read of this (small, lookup-sized) table instead of scanning every restaurant_location
// and de-duping city values in JS.
export async function list() {
  const ctx = adminContext();
  const cities = await ctx.table('cities').findMany({
    where:   { active: true },
    orderBy: 'sort_order',
    order:   'asc',
  });
  return { cities };
}
