import { defineTable, string, json } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

// A merchant's restaurant brand. Physical-site facts (address, contact, rating,
// price, Google Places data) live on restaurant_locations — a restaurant can have
// more than one. Cuisine lives on restaurant_cuisines (many-to-many).
export default defineTable({
  name: 'restaurants',
  actor: 'admin',
  timestamps: true,
  columns: {
    restaurant_id:  string().required().unique().primary(),
    application_id: string().ref('merchant_applications.application_id'),
    owner_user_id:  string(),
    category_id:    string().ref('categories.category_id'),
    name:           string().required(),
    ...localeColumns('name'),
    description:    string(),
    ...localeColumns('description'),
    logo:           string(),
    banner:         string(),
    // "Known for" tagline (e.g. "Rooftop seating, live jazz") — a single free-text
    // display field, not a structured list; distinct from `amenities` below.
    known_for:      string(),
    ...localeColumns('known_for'),
    // string[] of free-text amenity labels (e.g. "Wifi", "Parking", "Outdoor seating") —
    // no controlled vocabulary/table yet, same rationale as restaurant_locations.images
    // being a bare json() array.
    amenities:      json().default([]),
    // string[] of merchant-uploaded photo URLs, additional to `banner` (the hero image).
    // Distinct from restaurant_locations.images, which is Places-backfilled and blank
    // for merchant-onboarded locations.
    gallery:        json().default([]),
    status:         string().enum(['pending', 'unclaimed', 'active', 'suspended']).default('pending').required(),
    suspension_reason: string(),
  },
});
