import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

export default defineTable({
  name: 'categories',
  actor: 'admin',
  timestamps: true,
  columns: {
    category_id: string().required().unique().primary(),
    name:        string().required().unique(),
    icon:        string(),
    active:      boolean().default(true).required(),
    sort_order:  number().default(0),
  },
});
