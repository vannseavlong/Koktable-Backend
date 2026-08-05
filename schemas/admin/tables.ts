import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

// A physical table within a room. restaurant_id/location_id are denormalized two and
// one levels down (via room_id/floor_id) — see rooms.ts on why.
// No live occupancy/status column: whether a table is currently free is derived from
// active reservations against it, not tracked here — storing it directly would be the
// same denormalized-state trap `restaurant_hours` replaced (see its own history).
// label is not unique-enforced (this adapter only supports single-column .unique(),
// and uniqueness here would need to be scoped per room, not global) — callers should
// validate "no duplicate label within a room" themselves if desired.
export default defineTable({
  name: 'tables',
  actor: 'admin',
  timestamps: true,
  columns: {
    table_id:      string().required().unique().primary(),
    restaurant_id: string().required().ref('restaurants.restaurant_id'),
    location_id:   string().required().ref('restaurant_locations.location_id'),
    room_id:       string().required().ref('rooms.room_id'),
    label:         string().required(),           // e.g. "T1", "12", "Booth 3"
    seats:         number().min(1).required(),
    shape:         string().enum(['round', 'square', 'rectangle']).default('square').required(),
    // Floor-plan coordinates; blank until an admin arranges the layout.
    position_x:    number(),
    position_y:    number(),
    sort_order:    number().default(0),
    active:        boolean().default(true).required(),
  },
});
