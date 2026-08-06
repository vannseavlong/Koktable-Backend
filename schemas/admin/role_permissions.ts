import { defineTable, string } from 'longcelot-sheet-db';

// A checked cell in the matrix: this role has been granted this (module, action) pair —
// see module_actions.ts for the pair itself (which cells exist at all) and modules.ts/
// actions.ts for the canonical vocabulary. No composite unique on (role_id,
// module_action_id) — this adapter only supports single-column .unique() (same
// limitation noted on tables.ts's `label`); the service layer should no-op a duplicate
// grant instead of relying on a DB constraint.
export default defineTable({
  name: 'role_permissions',
  actor: 'admin',
  timestamps: true,
  columns: {
    role_permission_id: string().required().unique().primary(),
    role_id:             string().required().ref('roles.role_id'),
    module_action_id:    string().required().ref('module_actions.module_action_id'),
  },
});
