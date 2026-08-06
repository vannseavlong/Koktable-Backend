import { defineTable, string, number, boolean } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

export default defineTable({
  name: 'cities',
  actor: 'admin',
  timestamps: true,
  columns: {
    city_id:    string().required().unique().primary(),
    name:       string().required().unique(),
    ...localeColumns('name'),
    active:     boolean().default(true).required(),
    sort_order: number().default(0),
  },
});
