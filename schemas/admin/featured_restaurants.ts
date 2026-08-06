import { defineTable, string, number, date, boolean } from 'longcelot-sheet-db';

// Homepage curation (Overview.md §1.5: "Trending this week"/"Editor's Picks"/banner
// management) — one table with a `placement` facet rather than three near-identical
// tables, since every row is the same atomic fact ("this restaurant is featured here,
// for this window"). Also the mechanism behind promoted-listing revenue (Overview.md
// §6.3), though payment/billing for a placement is tracked via invoices, not here.
export default defineTable({
  name: 'featured_restaurants',
  actor: 'admin',
  timestamps: true,
  columns: {
    feature_id:    string().required().unique().primary(),
    restaurant_id:  string().required().ref('restaurants.restaurant_id'),
    placement:      string().enum(['trending', 'editors_pick', 'homepage_banner']).required(),
    starts_at:      date(),
    ends_at:        date(), // blank = open-ended until deactivated
    sort_order:     number().default(0),
    active:         boolean().default(true).required(),
  },
});
