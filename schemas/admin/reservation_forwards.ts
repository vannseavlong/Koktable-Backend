import { defineTable, string, date } from 'longcelot-sheet-db';

// One row per admin outreach attempt on a booking against an unregistered/unclaimed
// restaurant (Overview.md §1.1's "forward to unregistered restaurants via Telegram,
// email, or phone"). admin-actor, not user-actor: reservations live in each customer's
// own per-user sheet (schemas/user/reservations.ts), but this log is an admin operational
// record that needs to be listable/filterable across every user's bookings at once —
// same shared-sheet rationale as merchant_applications/merchant_invites.
//
// reservation_id/user_id aren't .ref() — the reservation they point at lives in a
// per-user sheet, not a table this adapter can validate an FK against (see adapter.ts:
// admin/user tables are physically separate sheets). user_id is required so a lookup can
// resolve userContext(user_id, ...) back to the actual reservation row.
export default defineTable({
  name: 'reservation_forwards',
  actor: 'admin',
  timestamps: true,
  columns: {
    forward_id:     string().required().unique().primary(),
    reservation_id: string().required(),
    user_id:        string().required().ref('users.user_id'),
    // Blank when the target is fully off-platform (no restaurants row exists yet) —
    // forwarding can happen before a directory-import or merchant application creates one.
    restaurant_id:  string().ref('restaurants.restaurant_id'),
    target_name:    string().required(),   // restaurant name as contacted, in case restaurant_id is blank
    target_contact: string(),              // phone/handle/email actually used
    channel:        string().enum(['telegram', 'email', 'call']).required(),
    message:        string(),
    sent_by:        string().required().ref('users.user_id'), // admin who sent it
    sent_at:        date().required(),
    // SLA follow-up deadline (Overview.md: "no response in 2 hours triggers a follow-up
    // call") — computed at write time from sent_at + the configured SLA window, not
    // re-derived on read, so a later SLA-window config change doesn't retroactively move
    // the deadline on forwards already sent.
    sla_due_at:     date(),
    responded_at:   date(),
    response_status: string().enum(['confirmed', 'declined', 'no_response']),
  },
});
