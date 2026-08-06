import { defineTable, string, number, boolean } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

export default defineTable({
  name: 'catalog_items',
  actor: 'admin',
  timestamps: true,
  columns: {
    item_id:     string().required().unique().primary(),
    restaurant_id:     string().required().ref('restaurants.restaurant_id'),
    item_type:   string().enum(['service', 'product']).default('service').required(),
    name:        string().required(),
    ...localeColumns('name'),
    description: string(),
    ...localeColumns('description'),
    price_from:  number().min(0).required(),
    icon:        string(),
    color:       string(),
    image:       string(),
    category_id: string().ref('categories.category_id'),
    active:      boolean().default(true).required(),
    sort_order:  number().default(0),
    quantity:       number().min(0),
    daily_capacity: number().min(0),
  },
});
