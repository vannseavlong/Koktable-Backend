import { defineTable, string, number, boolean } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

export default defineTable({
  name: 'categories',
  actor: 'admin',
  timestamps: true,
  columns: {
    category_id: string().required().unique().primary(),
    name:        string().required().unique(),
    ...localeColumns('name'),
    icon:        string(),
    active:      boolean().default(true).required(),
    sort_order:  number().default(0),
    // Moderation queue (Overview.md §1.1): merchant-submitted rows start 'pending' and
    // are hidden from the public list (services.ts filters active:true, not this) until
    // an admin approves them. Admin-created rows default 'approved' — no behavior change
    // for existing data.
    moderation_status: string().enum(['approved', 'pending', 'rejected']).default('approved').required(),
    // Not .ref('users.user_id') — restaurants.category_id already points into this table,
    // and users.role_id -> roles.restaurant_id -> restaurants would close a cycle back
    // here through this one edge. Blank for admin-created rows.
    submitted_by:       string(),
  },
});
