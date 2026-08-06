import { defineTable, string, number, boolean } from 'longcelot-sheet-db';

// One row per restaurant_location (Overview.md §2: "deposit required yes/no and amount,
// cancellation cutoff window, minimum and maximum party size, how far in advance bookings
// can be made") — keyed by location_id, not restaurant_id, same rationale as
// restaurant_hours: a multi-branch merchant isn't assumed to run one policy across every
// site. restaurant_id is denormalized from location_id, same convention as
// floors/rooms/tables/restaurant_hours (this adapter has no joins).
//
// No row for a location = platform defaults apply (Overview.md §1.5 Platform Settings) —
// this table only holds a location's *overrides*, not a full row seeded at location-creation
// time, so changing the platform default doesn't require touching every existing location.
export default defineTable({
  name: 'restaurant_booking_policies',
  actor: 'admin',
  timestamps: true,
  columns: {
    policy_id:                string().required().unique().primary(),
    restaurant_id:             string().required().ref('restaurants.restaurant_id'),
    location_id:               string().required().unique().ref('restaurant_locations.location_id'),
    deposit_required:          boolean().default(false).required(),
    deposit_amount:            number().min(0), // meaningful only when deposit_required
    cancellation_window_hours: number().min(0), // blank = no cutoff enforced
    min_party_size:            number().min(1),
    max_party_size:            number().min(1),
    booking_window_days:       number().min(0), // how far in advance a booking may be made; blank = no cap
  },
});
