import { defineTable, string, boolean, json } from 'longcelot-sheet-db';

// A restaurant_location's weekly operating hours — up to 7 rows per location, one per
// day_of_week (a day missing from the table has no hours configured for it). Keyed by
// location_id, not restaurant_id: a restaurant is no longer assumed to share one set of
// hours across all its sites once it has more than one location. restaurant_id is
// denormalized from location_id (Sheets has no joins) so a brand's hours can be queried
// directly across all its locations — same convention as floors.ts/rooms.ts/tables.ts.
export default defineTable({
  name: 'restaurant_hours',
  actor: 'admin',
  timestamps: true,
  columns: {
    hours_id:      string().required().unique().primary(),
    restaurant_id: string().required().ref('restaurants.restaurant_id'),
    location_id:   string().required().ref('restaurant_locations.location_id'),
    day_of_week:   string().enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).required(),
    closed:        boolean().default(false).required(),
    open_24h:      boolean().default(false).required(),
    periods:       json().default([]),
  },
});
