import { defineTable, string, number, boolean } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

// Canonical sublocality/neighborhood vocabulary (BKK1, Sla Kram, ...) — narrower than
// cities.ts, one level down (city_id). Same rationale as cities.ts: restaurant_locations.
// district_id refs this table instead of storing district as free text, so the "All
// districts" filter dropdown is a cheap read of this (small) table, and repeated
// directory-crawl imports (scripts/backfill-district.ts) resolve into one canonical row
// per district name instead of drifting into near-duplicates.
export default defineTable({
  name: 'districts',
  actor: 'admin',
  timestamps: true,
  columns: {
    district_id: string().required().unique().primary(),
    city_id:     string().required().ref('cities.city_id'),
    name:        string().required(),
    ...localeColumns('name'),
    active:      boolean().default(true).required(),
    sort_order:  number().default(0),
  },
});
