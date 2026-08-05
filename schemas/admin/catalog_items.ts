import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

// Restaurant-scoped catalog (services or physical products), separate from the legacy
// single-restaurant `services` table so the current admin portal/mobile app keep working
// unmodified. CRUD via /admin/catalog-items (cross-restaurant) and /merchant/catalog-items
// (scoped to the caller's own restaurant_id).
export default defineTable({
  name: 'catalog_items',
  actor: 'admin',
  timestamps: true,
  columns: {
    item_id:     string().required().unique().primary(),
    restaurant_id:     string().required().ref('restaurants.restaurant_id'),
    item_type:   string().enum(['service', 'product']).default('service').required(),
    name:        string().required(),
    description: string(),
    price_from:  number().min(0).required(),
    icon:        string(),
    color:       string(),
    image:       string(),
    category_id: string().ref('categories.category_id'),
    active:      boolean().default(true).required(),
    sort_order:  number().default(0),
    // Optional — undefined means "unlimited". quantity applies to item_type:
    // 'product' (decremented per reservation, blocks at 0); daily_capacity applies to
    // item_type: 'service' (caps concurrent overlapping reservations for that item).
    quantity:       number().min(0),
    daily_capacity: number().min(0),
  },
});
