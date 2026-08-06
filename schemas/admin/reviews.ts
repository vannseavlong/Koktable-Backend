import { defineTable, string, number, date } from 'longcelot-sheet-db';

// A completed-reservation review (Overview.md §2: "view and respond to reviews").
// admin-actor like catalog_items/restaurant_cuisines, not user-actor: reviews are read
// restaurant-first (public restaurant page, merchant dashboard, admin moderation), and
// this adapter has no joins — fragmenting reviews across each reviewer's own per-user
// sheet would mean fetching every user's sheet just to render one restaurant's review
// list. reservation_id/reviewer_user_id aren't .ref() for the same reason as
// reservation_forwards.reservation_id: the reservation lives in a per-user sheet this
// adapter can't validate an FK against.
//
// reviewer_name is denormalized at write time (mirrors reservations.guest_name/
// service_name) so a review list never needs a per-review user lookup.
export default defineTable({
  name: 'reviews',
  actor: 'admin',
  timestamps: true,
  columns: {
    review_id:         string().required().unique().primary(),
    restaurant_id:      string().required().ref('restaurants.restaurant_id'),
    reservation_id:     string().required().unique(), // one review per completed reservation
    reviewer_user_id:   string().required().ref('users.user_id'),
    reviewer_name:      string().required(),
    rating:             number().min(1).max(5).required(),
    comment:            string(),
    merchant_reply:     string(),
    merchant_replied_at: date(),
  },
});
