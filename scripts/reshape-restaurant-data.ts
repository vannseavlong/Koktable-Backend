/**
 * One-time reshape of resteruant.json from its original Google-Places-shaped records
 * into arrays that mirror the restaurants/restaurant_locations/restaurant_cuisines/
 * restaurant_hours table split (schemas/admin/*.ts) column-for-column, so
 * seeds/restaurants.ts becomes a near-identity mapping instead of doing the
 * splitting/parsing itself. Overwrites resteruant.json in place — tracked in git,
 * revertible with `git checkout -- resteruant.json`.
 *
 * Usage: pnpm exec tsx scripts/reshape-restaurant-data.ts
 */
import fs from 'fs';
import path from 'path';
import { priceLevelToSymbol } from '../src/utils/restaurantPricing';
import { parseOpeningHoursLines } from '../src/utils/restaurantHours';

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

const filePath = path.join(__dirname, '..', 'resteruant.json');
const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { meta: unknown; restaurants: SourceRestaurant[] };

const restaurants = raw.restaurants.map((r) => ({
  restaurant_id: r.id,
  name:          r.name,
  status:        'active' as const,
}));

const restaurant_locations = raw.restaurants.map((r) => ({
  restaurant_id:   r.id,
  address:         r.address,
  city:            r.city,
  latitude:        r.location.lat,
  longitude:       r.location.lng,
  rating:          r.rating,
  rating_count:    r.rating_count,
  price_level:     r.price_level,
  price_symbol:    r.price_level != null ? priceLevelToSymbol(r.price_level) : null,
  contact_phone:   r.phone,
  images:          r.images,
  google_place_id: r.source.place_id,
}));

const restaurant_cuisines = raw.restaurants.flatMap((r) =>
  r.cuisine.map((cuisine) => ({ restaurant_id: r.id, cuisine }))
);

const restaurant_hours = raw.restaurants.flatMap((r) =>
  parseOpeningHoursLines(r.opening_hours).map((day) => ({
    restaurant_id: r.id,
    day_of_week:   day.day_of_week,
    closed:        day.closed,
    open_24h:      day.open_24h,
    periods:       day.periods,
  }))
);

const reshaped = { meta: raw.meta, restaurants, restaurant_locations, restaurant_cuisines, restaurant_hours };

fs.writeFileSync(filePath, JSON.stringify(reshaped, null, 2) + '\n');

console.log(`Reshaped resteruant.json:`);
console.log(`  restaurants: ${restaurants.length}`);
console.log(`  restaurant_locations: ${restaurant_locations.length}`);
console.log(`  restaurant_cuisines: ${restaurant_cuisines.length}`);
console.log(`  restaurant_hours: ${restaurant_hours.length}`);
