import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

export default defineTable({
  name: 'cities',
  actor: 'admin',
  timestamps: true,
  columns: {
    city_id:    string().required().unique().primary(),
    name:       string().required().unique(),
    active:     boolean().default(true).required(),
    sort_order: number().default(0),
  },
});
