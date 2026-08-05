import { defineTable, string, number, json, boolean } from 'longcelot-sheet-db';

// A restaurant's physical site — one restaurant can have several (chains/branches).
// Holds everything tied to a specific place: contact info a customer would call/visit,
// and the directory-import facts (rating, price, photos) sourced from Google Places for
// that one place, which don't make sense averaged/shared across a brand's locations.
export default defineTable({
  name: 'restaurant_locations',
  actor: 'admin',
  timestamps: true,
  columns: {
    location_id:     string().required().unique().primary(),
    restaurant_id:   string().required().ref('restaurants.restaurant_id'),
    name:            string(),           // e.g. "Downtown Branch"; blank for a single-location restaurant
    contact_email:   string(),
    contact_phone:   string(),
    address:         string(),
    city:            string(),
    latitude:        number(),
    longitude:       number(),
    active:          boolean().default(true).required(),
    // Directory-import fields (populated for bulk-seeded listings; blank for
    // merchant-onboarded locations unless backfilled).
    rating:          number(),
    rating_count:    number(),
    price_level:     number(),           // 1-4, Google Places scale; blank when unknown — source of truth
    price_symbol:    string(),           // derived from price_level, see src/utils/restaurantPricing.ts
    images:          json().default([]), // string[] of photo URLs
    google_place_id: string().unique(),  // dedup key for re-running the directory import
  },
});
