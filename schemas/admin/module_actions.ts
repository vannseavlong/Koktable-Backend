import { defineTable, string } from 'longcelot-sheet-db';

// Which (module, action) cells actually exist in the matrix — e.g. Dashboard only pairs
// with 'view', Bookings pairs with 'view'/'edit'/'forward'. This is what the RBAC config
// UI iterates to render the checkbox grid itself (and what a "hide the Create button
// unless granted" check ultimately points back to); role_permissions.ts then says which
// of these cells a given role has actually been granted. No composite unique on
// (module_id, action_id) — same single-column-.unique() limitation as role_permissions.
export default defineTable({
  name: 'module_actions',
  actor: 'admin',
  timestamps: true,
  columns: {
    module_action_id: string().required().unique().primary(),
    module_id:         string().required().ref('modules.module_id'),
    action_id:         string().required().ref('actions.action_id'),
  },
});
