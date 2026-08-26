import { defineTable, string, number, json, boolean } from 'longcelot-sheet-db';

// The previously-hardcoded Basic/Pro comparison (duplicated across
// restaurantLocations.service.ts's branch-limit check and Portal's
// my-billing/index.tsx TIER_FEATURES const) as real, admin-editable data. One row
// per `subscriptions.tier` value — `tier` is unique so `getByTier()` is a plain lookup.
export default defineTable({
  name: 'plans',
  actor: 'admin',
  timestamps: true,
  columns: {
    plan_id:                 string().required().unique().primary(),
    tier:                    string().enum(['basic', 'pro']).required().unique(),
    name:                    string().required(),
    price_monthly:           number().min(0).required(),
    price_annual:            number().min(0).required(),
    // Falls back to platform_settings' default when blank — same convention as
    // subscriptions.commission_rate (see schemas/admin/subscriptions.ts).
    commission_rate_default: number().min(0).max(1),
    // Blank = unlimited (mirrors restaurant_locations' unbounded-for-Pro behavior).
    max_locations:           number().min(1),
    features:                json().default([]), // string[], shown as a bullet list
    active:                  boolean().default(true).required(),
    sort_order:              number().default(0).required(),
  },
});
