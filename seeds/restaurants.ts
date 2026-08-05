// Bulk directory import — Cambodia restaurants (Phnom Penh, Sihanoukville, Siem Reap)
// sourced from Google Places, see ../resteruant.json for the raw source data and its
// own `meta` block. resteruant.json's four top-level arrays already mirror the DB split
// column-for-column (see scripts/reshape-restaurant-data.ts, which produced this shape) —
// this file only adds generated primary keys and resolves cuisine names to cuisine_ids.
// Run after seeds/admin.ts and seeds/cuisines.ts — restaurant_cuisines.cuisine_id refs
// the cuisines table, so it must exist first (restaurants.category_id is optional and
// left blank here, so there's no ordering dependency on categories itself).
//
// Run: pnpm db:seed seeds/restaurants.ts --skip-existing
// `--skip-existing` relies on the `google_place_id` unique constraint
// (schemas/admin/restaurant_locations.ts) to no-op already-imported rows on a rerun;
// restaurant_hours/restaurant_cuisines/restaurant_locations rows use deterministic ids
// for the same reason.
//
// Imported rows have no owner_user_id/application_id (no merchant has claimed them yet)
// and status: 'active' — they're real, currently-operating restaurants meant to be
// bookable immediately. category_id is left blank: cuisine is a separate facet from the
// dining-style categories table, not a replacement for it.
//
// Doesn't seed floors/rooms/tables — every restaurant_location is meant to end up with
// at least one floor once that management flow exists (see schemas/admin/floors.ts);
// left for whoever builds that, not invented here from directory-import data.

import restaurantData from '../resteruant.json';
import { cuisineSlug } from './shared/cuisineSlug';

const restaurants = restaurantData.restaurants;

const restaurant_locations = restaurantData.restaurant_locations.map((loc) => ({
  location_id: `loc_${loc.restaurant_id}`,
  ...loc,
}));

const restaurant_cuisines = restaurantData.restaurant_cuisines.map((rc) => {
  const cuisine_id = cuisineSlug(rc.cuisine);
  return {
    restaurant_cuisine_id: `rc_${rc.restaurant_id}_${cuisine_id}`,
    restaurant_id: rc.restaurant_id,
    cuisine_id,
  };
});

const restaurant_hours = restaurantData.restaurant_hours.map((h) => ({
  hours_id: `hrs_${h.restaurant_id}_${h.day_of_week}`,
  ...h,
}));

export default { restaurants, restaurant_locations, restaurant_cuisines, restaurant_hours };
