import { defineTable, string } from 'longcelot-sheet-db';

// Generic key-value platform config (Overview.md §1.5: commission rate, tier pricing,
// booking-window/cancellation-policy defaults, forward-SLA hours, ...). One flat KV table
// instead of a dedicated column per setting: the set of settings will keep growing and a
// column-per-setting schema would mean a migration for every new knob. value is always a
// string; callers parse to number/boolean/JSON as that specific key requires.
export default defineTable({
  name: 'platform_settings',
  actor: 'admin',
  timestamps: true,
  columns: {
    setting_key: string().required().unique().primary(),
    value:       string().required(),
    description: string(),
  },
});
