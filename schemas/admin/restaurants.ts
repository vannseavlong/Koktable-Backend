import { defineTable, string } from 'longcelot-sheet-db';

// A merchant's restaurant brand. Physical-site facts (address, contact, rating,
// price, Google Places data) live on restaurant_locations — a restaurant can have
// more than one. Cuisine lives on restaurant_cuisines (many-to-many).
export default defineTable({
  name: 'restaurants',
  actor: 'admin',
  timestamps: true,
  columns: {
    restaurant_id:  string().required().unique().primary(),
    application_id: string().ref('merchant_applications.application_id'),
    owner_user_id:  string(),
    category_id:    string().ref('categories.category_id'),
    name:           string().required(),
    description:    string(),
    logo:           string(),
    banner:         string(),
    status:         string().enum(['pending', 'active', 'suspended']).default('pending').required(),
  },
});
