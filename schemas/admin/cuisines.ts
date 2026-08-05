import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

// Canonical cuisine vocabulary (Khmer, Thai, Italian, ...) — mirrors categories.ts.
// restaurant_cuisines is the many-to-many join table between restaurants and this table.
export default defineTable({
  name: 'cuisines',
  actor: 'admin',
  timestamps: true,
  columns: {
    cuisine_id: string().required().unique().primary(),
    name:       string().required().unique(),
    icon:       string(),
    active:     boolean().default(true).required(),
    sort_order: number().default(0),
  },
});
