import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

// Admin-managed service catalogue displayed on the Home screen.
export default defineTable({
  name: 'services',
  actor: 'admin',
  timestamps: true,
  columns: {
    service_id:  string().required().unique().primary(),
    name:        string().required(),
    description: string(),
    price_from:  number().min(0).required(),
    icon:        string().required(),    // icon name / emoji key used by the mobile app
    color:       string().required(),    // background hex colour for the card
    category_id: string().ref('categories.category_id').required(),
    active:      boolean().default(true).required(),
    sort_order:  number().default(0),
  },
});
