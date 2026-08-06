import { defineTable, string, number, boolean } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

// Canonical page/area list the RBAC matrix (Overview.md §4) is built from — admin modules
// (Dashboard, Bookings, Merchant Applications, ...) and merchant modules (Dashboard,
// Bookings, Menu, Rooms/Tables, Staff, ...) are different sets, same table via `scope`.
// `key` is the stable code-facing id (route guards, nav config); module_id is just the
// row's own PK like everywhere else. route/icon are here so the same table can drive both
// the RBAC config screen and left-nav rendering (hide a whole nav item when a role has no
// actions at all on it).
export default defineTable({
  name: 'modules',
  actor: 'admin',
  timestamps: true,
  columns: {
    module_id:  string().required().unique().primary(),
    scope:      string().enum(['admin', 'merchant']).required(),
    key:        string().required().unique(), // e.g. 'bookings', 'billing'
    name:       string().required(),
    ...localeColumns('name'),
    route:      string(),
    icon:       string(),
    sort_order: number().default(0),
    active:     boolean().default(true).required(),
  },
});
