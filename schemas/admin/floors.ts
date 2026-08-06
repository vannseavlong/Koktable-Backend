import { defineTable, string, number, boolean } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

// A physical floor/level at one restaurant_location (e.g. "Ground Floor", "Rooftop").
// Every location has at least one — even a single-floor site gets one row (e.g.
// "Main Floor") rather than location_id being optional. restaurant_id is denormalized
// from location_id (Sheets has no joins) so a brand's floors can be queried directly
// across all its locations.
export default defineTable({
  name: 'floors',
  actor: 'admin',
  timestamps: true,
  columns: {
    floor_id:      string().required().unique().primary(),
    restaurant_id: string().required().ref('restaurants.restaurant_id'),
    location_id:   string().required().ref('restaurant_locations.location_id'),
    name:          string().required(),
    ...localeColumns('name'),
    sort_order:    number().default(0),
    active:        boolean().default(true).required(),
  },
});
