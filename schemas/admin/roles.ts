import { defineTable, string, boolean } from 'longcelot-sheet-db';

// Fine-grained RBAC role (Overview.md §4: "Super Admin"/"Ops Admin"/... on the admin side,
// "Owner"/"Manager"/"Staff" per restaurant on the merchant side) — separate from
// users.role, which stays the coarse 'user'|'admin'|'merchant'|'guest' auth-flow
// discriminator middleware/auth.ts's requireAdmin/requireMerchant already gate on. This
// table is the *within-admin* or *within-restaurant* breakdown of who can do what.
export default defineTable({
  name: 'roles',
  actor: 'admin',
  timestamps: true,
  columns: {
    role_id:       string().required().unique().primary(),
    scope:         string().enum(['admin', 'merchant']).required(),
    // Set only for scope:'merchant' — which restaurant this role belongs to. Blank for
    // scope:'admin' roles (Super Admin, Ops Admin, ...), which are platform-wide.
    restaurant_id: string().ref('restaurants.restaurant_id'),
    name:          string().required(), // e.g. "Ops Admin", "Owner", "Manager"
    // Basic-tier Owner/Staff and the built-in admin roles are fixed — not editable/
    // deletable (Overview.md §5: "Fixed, Owner and Staff, not editable"). Pro-tier custom
    // roles have is_system: false.
    is_system:     boolean().default(false).required(),
    active:        boolean().default(true).required(),
  },
});
