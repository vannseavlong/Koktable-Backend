import { defineTable, string, boolean, json } from 'longcelot-sheet-db';

export default defineTable({
  name: 'restaurant_hours',
  actor: 'admin',
  timestamps: true,
  columns: {
    hours_id:      string().required().unique().primary(),
    restaurant_id: string().required().ref('restaurants.restaurant_id'),
    day_of_week:   string().enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).required(),
    closed:        boolean().default(false).required(),
    open_24h:      boolean().default(false).required(),
    periods:       json().default([]),
  },
});
