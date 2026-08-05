import { defineTable, string } from 'longcelot-sheet-db';

// Many-to-many join between restaurants and cuisines — one row per (restaurant_id,
// cuisine_id). restaurant_cuisine_id is this row's own PK, distinct from cuisine_id
// (the FK into the cuisines lookup table).
export default defineTable({
  name: 'restaurant_cuisines',
  actor: 'admin',
  timestamps: true,
  columns: {
    restaurant_cuisine_id: string().required().unique().primary(),
    restaurant_id:          string().required().ref('restaurants.restaurant_id'),
    cuisine_id:             string().required().ref('cuisines.cuisine_id'),
  },
});
