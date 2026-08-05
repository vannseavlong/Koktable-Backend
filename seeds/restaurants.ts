// Bulk directory import — Cambodia restaurants (Phnom Penh, Sihanoukville, Siem Reap)
// sourced from Google Places, see ../resteruant.json for the raw source data and its
// own `meta` block. Run after seeds/admin.ts (restaurants.category_id is optional and
// left blank here, so there's no ordering dependency on categories, but running admin.ts
// first keeps the sheet's row order sensible).
//
// Run: pnpm db:seed seeds/restaurants.ts --skip-existing
// `--skip-existing` relies on the `google_place_id` unique constraint (schemas/admin/restaurants.ts)
// to no-op already-imported rows on a rerun, so this is safe to run more than once.
//
// Imported rows have no owner_user_id/application_id (no merchant has claimed them yet)
// and status: 'active' — they're real, currently-operating restaurants meant to be
// bookable immediately. category_id is left blank: cuisine (below) is a separate facet
// from the dining-style categories table, not a replacement for it.

import restaurantData from '../resteruant.json';
import { priceLevelToSymbol } from '../src/utils/restaurantPricing';
import { summarizeOpeningHours } from '../src/utils/restaurantHours';

interface SourceRestaurant {
  id: string;
  name: string;
  city: string;
  cuisine: string[];
  address: string;
  location: { lat: number; lng: number };
  rating: number;
  rating_count: number;
  price_level: number | null;
  price_symbol: string | null;
  phone: string | null;
  opening_hours: string[];
  images: string[];
  source: { provider: string; place_id: string };
}

const restaurants = (restaurantData.restaurants as SourceRestaurant[]).map((r) => ({
  restaurant_id:   r.id,
  name:            r.name,
  status:          'active' as const,
  address:         r.address,
  city:            r.city,
  cuisine:         r.cuisine,
  latitude:        r.location.lat,
  longitude:       r.location.lng,
  rating:          r.rating,
  rating_count:    r.rating_count,
  // price_symbol is derived from price_level (see src/utils/restaurantPricing.ts) rather
  // than trusted from the source file, so the two columns can't drift apart even if the
  // raw Places export ever disagrees with itself.
  ...(r.price_level != null ? { price_level: r.price_level, price_symbol: priceLevelToSymbol(r.price_level) } : {}),
  ...(r.phone ? { contact_phone: r.phone } : {}),
  opening_hours:   r.opening_hours,
  // hours (plain-string summary) is populated from opening_hours (structured per-day
  // list) so a client reading `hours` alone doesn't see a blank field for imported
  // restaurants — see src/utils/restaurantHours.ts.
  ...(summarizeOpeningHours(r.opening_hours) ? { hours: summarizeOpeningHours(r.opening_hours) } : {}),
  images:          r.images,
  google_place_id: r.source.place_id,
}));

export default { restaurants };
