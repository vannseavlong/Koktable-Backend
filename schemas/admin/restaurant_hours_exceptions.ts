import { defineTable, string, date, boolean, json } from 'longcelot-sheet-db';

// One-off overrides of a restaurant_location's regular weekly hours (Overview.md §2:
// "regular weekly hours plus one-off closures, such as holidays or private events, that
// override the regular schedule for a specific date"). Separate table from
// restaurant_hours, not a special day_of_week row there: restaurant_hours is the
// recurring weekly pattern (7 rows max, keyed by day name); this is dated, unbounded, and
// looked up by exact date, not weekday — a fundamentally different access pattern, so a
// combined table would need every reader to branch on whether a row is a weekly rule or a
// dated exception. restaurant_id denormalized from location_id, same convention as
// restaurant_hours/floors/rooms/tables.
export default defineTable({
  name: 'restaurant_hours_exceptions',
  actor: 'admin',
  timestamps: true,
  columns: {
    exception_id:  string().required().unique().primary(),
    restaurant_id: string().required().ref('restaurants.restaurant_id'),
    location_id:   string().required().ref('restaurant_locations.location_id'),
    date:          date().required(), // the specific calendar date this overrides
    reason:        string(), // e.g. "Public Holiday", "Private Event"
    closed:        boolean().default(true).required(), // true = fully closed that date
    periods:       json().default([]), // same shape as restaurant_hours.periods; only meaningful when closed: false
  },
});
