import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

// Shared taxonomy referenced by `restaurants.category_id`, `catalog_items.category_id`
// and `services.category_id` — admin-managed, replaces the free-text `category`
// strings merchants/admin used to type by hand.
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
