import { defineTable, string } from 'longcelot-sheet-db';

// Overview.md §1.5: "ticket queue for both merchant issues ... and user complaints ...
// without this, support happens over scattered email/Telegram threads with no record."
// reservation_id (booking-dispute tickets) isn't .ref() — same cross-sheet limitation as
// reservation_forwards.reservation_id.
export default defineTable({
  name: 'support_tickets',
  actor: 'admin',
  timestamps: true,
  columns: {
    ticket_id:         string().required().unique().primary(),
    requester_user_id:  string().required().ref('users.user_id'),
    requester_role:     string().enum(['user', 'merchant']).required(),
    restaurant_id:      string().ref('restaurants.restaurant_id'), // set for merchant billing/technical tickets
    reservation_id:     string(), // set for a booking-dispute ticket
    subject:            string().required(),
    category:           string().enum(['billing', 'technical', 'booking_dispute', 'other']).default('other').required(),
    status:             string().enum(['open', 'in_progress', 'resolved', 'closed']).default('open').required(),
    // Pro tier gets a priority queue (Overview.md §5) — set at ticket-creation time from
    // the requester's subscription tier, not re-derived on every read.
    priority:           string().enum(['standard', 'priority']).default('standard').required(),
    assigned_to:        string().ref('users.user_id'),
  },
});
