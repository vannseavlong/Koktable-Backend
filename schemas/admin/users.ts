import { defineTable, string } from 'longcelot-sheet-db';

export default defineTable({
  name: 'users',
  actor: 'admin',
  timestamps: true,
  columns: {
    user_id:       string().required().unique().primary(),
    email:         string().required().unique(),
    full_name:     string().required(),
    picture:       string(),
    // 'guest' = auto-created at guest-checkout time (no credentials row, no password) so
    // a reservation can still live in a normal per-user sheet — see reservation_tokens.ts.
    // Excluded from "active users" KPIs (Overview.md §1.1) unless explicitly included.
    role:          string().enum(['user', 'admin', 'merchant', 'guest']).default('user').required(),
    auth_provider: string().enum(['google', 'email']).required(),
    actor_sheet_id: string(),
    status:        string().enum(['active', 'inactive']).default('active').required(),
    // Fine-grained admin RBAC role (roles.ts, scope:'admin') — e.g. which of Super
    // Admin/Ops Admin/Support Agent/Marketing this admin user has. Blank for role
    // != 'admin'; merchant staff get their role via restaurant_staff.role_id instead,
    // since a merchant's role is scoped to one restaurant, not global like an admin's.
    role_id:       string().ref('roles.role_id'),
  },
});
