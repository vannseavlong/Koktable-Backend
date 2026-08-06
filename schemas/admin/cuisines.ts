import { defineTable, string, number, boolean } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

// Canonical cuisine vocabulary (Khmer, Thai, Italian, ...) — mirrors categories.ts.
// restaurant_cuisines is the many-to-many join table between restaurants and this table.
export default defineTable({
  name: 'cuisines',
  actor: 'admin',
  timestamps: true,
  columns: {
    cuisine_id: string().required().unique().primary(),
    name:       string().required().unique(),
    ...localeColumns('name'),
    icon:       string(),
    active:     boolean().default(true).required(),
    sort_order: number().default(0),
    // Moderation queue — see categories.ts, same rationale, including why
    // submitted_by isn't .ref()'d.
    moderation_status: string().enum(['approved', 'pending', 'rejected']).default('approved').required(),
    submitted_by:       string(),
  },
});
