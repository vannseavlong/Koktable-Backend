import { defineTable, string, number, json, boolean } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

export default defineTable({
  name: 'restaurant_locations',
  actor: 'admin',
  timestamps: true,
  columns: {
    location_id:     string().required().unique().primary(),
    restaurant_id:   string().required().ref('restaurants.restaurant_id'),
    name:            string(),           // e.g. "Downtown Branch"; blank for a single-location restaurant
    ...localeColumns('name'),
    contact_email:   string(),
    contact_phone:   string(),
    address:         string(),
    // FK into cities.ts/districts.ts rather than free text — see those schemas for why.
    // district_id is a directory-import field (scripts/backfill-district.ts), same as
    // rating/price_level/images below: blank for merchant-onboarded locations unless backfilled.
    city_id:         string().ref('cities.city_id'),
    district_id:     string().ref('districts.district_id'),
    latitude:        number(),
    longitude:       number(),
    active:          boolean().default(true).required(),
    rating:          number(),
    rating_count:    number(),
    price_level:     number(),           // 1-4, Google Places scale; blank when unknown — source of truth
    price_symbol:    string(),           // derived from price_level, see src/utils/restaurantPricing.ts
    images:          json().default([]), // string[] of photo URLs
    google_place_id: string().unique(),  // dedup key for re-running the directory import
  },
});
