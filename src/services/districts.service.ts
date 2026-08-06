import { adminContext } from '../lib/adapter';

export interface ListDistrictsQuery {
  city_id?: string;
}

// Public, unauthenticated read-only view onto the admin-actor `districts` table (see
// src/services/admin/districts.service.ts for the full-access equivalent). Only
// `active: true` rows are customer-visible. Optionally scoped to one city_id, for a
// cascading "pick a city, then pick a district within it" filter UI — same rationale as
// cities.service.ts, backed by a lookup-table read rather than scanning restaurant_locations.
export async function list(query: ListDistrictsQuery = {}) {
  const ctx = adminContext();
  const where: Record<string, unknown> = { active: true };
  if (query.city_id) where.city_id = query.city_id;

  const districts = await ctx.table('districts').findMany({ where, orderBy: 'sort_order', order: 'asc' });
  return { districts };
}
