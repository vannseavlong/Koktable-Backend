import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

// A section within a floor (e.g. "Main Hall", "Private Room A", "Patio"). restaurant_id
// and location_id are denormalized from floor_id (same tradeoff as catalog_items.restaurant_id)
// so a restaurant's or a location's rooms can be queried directly without joining through
// floors — Sheets has no join support. No stored capacity: total seating for a room is
// sum(tables.seats) where table.room_id = this room, computed on read rather than
// duplicated here.
export default defineTable({
  name: 'rooms',
  actor: 'admin',
  timestamps: true,
  columns: {
    room_id:       string().required().unique().primary(),
    restaurant_id: string().required().ref('restaurants.restaurant_id'),
    location_id:   string().required().ref('restaurant_locations.location_id'),
    floor_id:      string().required().ref('floors.floor_id'),
    name:          string().required(),
    sort_order:    number().default(0),
    active:        boolean().default(true).required(),
  },
});
