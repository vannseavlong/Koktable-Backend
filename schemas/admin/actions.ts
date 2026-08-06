import { defineTable, string, number } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

// Canonical verb list (Overview.md §4: View, Create, Edit, Delete, Approve, Export, plus
// workflow-specific ones like Forward/Confirm/Suspend) — shared across admin and merchant
// scope, unlike modules.ts, since the verbs themselves don't differ by portal.
export default defineTable({
  name: 'actions',
  actor: 'admin',
  timestamps: true,
  columns: {
    action_id:  string().required().unique().primary(),
    key:        string().required().unique(), // e.g. 'view', 'create', 'forward'
    name:       string().required(),
    ...localeColumns('name'),
    sort_order: number().default(0),
  },
});
