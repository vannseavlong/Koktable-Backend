import { defineTable, string, number, json } from 'longcelot-sheet-db';

// A merchant's restaurant. Created (status: 'pending') when an admin approves a
// merchant_applications row; owner_user_id/status: 'active' are filled in once the
// merchant redeems their invite. No .ref() on owner_user_id since it's blank pre-activation.
//
// A restaurant can also arrive pre-populated from a bulk directory import (e.g. sourced
// from Google Places) with no owner yet — status: 'active', owner_user_id blank, as an
// unclaimed listing a merchant can later be linked to. See seeds/restaurants.ts.
export default defineTable({
  name: 'restaurants',
  actor: 'admin',
  timestamps: true,
  columns: {
    restaurant_id:    string().required().unique().primary(),
    application_id:   string().ref('merchant_applications.application_id'),
    owner_user_id:    string(),
    category_id:      string().ref('categories.category_id'),
    name:             string().required(),
    description:      string(),
    logo:             string(),
    banner:           string(),
    contact_email:    string(),
    contact_phone:    string(),
    // Free-text summary, editable directly by merchants; the older FLUTTER_GUIDE.md
    // mobile contract read this field only, and it's the plain-string shape any future
    // client is most likely to want too. Kept in sync with opening_hours below — see
    // src/utils/restaurantHours.ts summarizeOpeningHours(), applied by every read path
    // (public/admin/merchant restaurant services) and by seeds/restaurants.ts on import
    // — rather than left to drift independently.
    hours:            string(),
    status:           string().enum(['pending', 'active', 'suspended']).default('pending').required(),
    // Directory-import fields (populated for bulk-seeded listings; blank for
    // merchant-onboarded restaurants unless backfilled).
    address:          string(),
    city:             string(),
    cuisine:          json().default([]),          // string[]
    latitude:         number(),
    longitude:        number(),
    rating:           number(),
    rating_count:     number(),
    price_level:      number(),                    // 1-4, Google Places scale; blank when unknown — source of truth
    // Derived from price_level, not independently maintained — see
    // src/utils/restaurantPricing.ts priceLevelToSymbol(), applied by every read path.
    // Column kept (rather than computed only in the API layer) so it's still visible/
    // sortable directly in the raw sheet.
    price_symbol:     string(),                     // e.g. "$", "$$"; blank when price_level is unknown
    // Structured per-day hours ("Monday: 11:00 AM – 9:00 PM"); the richer counterpart to
    // `hours` above, used for a per-day detail view (see Portal's restaurants-detail-dialog).
    opening_hours:    json().default([]),          // string[], one entry per day
    images:           json().default([]),          // string[] of photo URLs; empty until populated
    google_place_id:  string().unique(),            // dedup key for re-running the directory import
  },
});
