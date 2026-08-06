import { defineTable, string, date } from 'longcelot-sheet-db';

// User-reported restaurants (Overview.md §1.2: "flagged or reported restaurants ...
// separate from the application pipeline"). reporter_user_id is optional — a guest
// (role:'guest', see users.ts) can report without a full account.
export default defineTable({
  name: 'restaurant_reports',
  actor: 'admin',
  timestamps: true,
  columns: {
    report_id:         string().required().unique().primary(),
    restaurant_id:      string().required().ref('restaurants.restaurant_id'),
    reporter_user_id:   string().ref('users.user_id'),
    reason:             string().enum(['bad_experience', 'fake_listing', 'inappropriate_content', 'other']).required(),
    details:            string(),
    status:             string().enum(['open', 'reviewed', 'dismissed']).default('open').required(),
    reviewed_by:        string().ref('users.user_id'),
    reviewed_at:        date(),
  },
});
