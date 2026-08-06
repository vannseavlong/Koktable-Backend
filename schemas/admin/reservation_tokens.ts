import { defineTable, string, date } from 'longcelot-sheet-db';

// Backs the guest "manage/cancel booking without login" link (Overview.md §3). One row
// per reservation, admin-actor so a token can resolve straight to (user_id, reservation_id)
// without scanning every per-user sheet — same index rationale as merchant_invites'
// token_hash. Works for both guest and logged-in bookings; a guest's reservation still
// lives in a normal per-user sheet under an auto-created role:'guest' user (users.ts).
export default defineTable({
  name: 'reservation_tokens',
  actor: 'admin',
  timestamps: true,
  columns: {
    token_hash:     string().required().unique().primary(),
    reservation_id: string().required(),
    user_id:        string().required().ref('users.user_id'),
    expires_at:     date(), // blank = doesn't expire on its own; revoke by deleting the row
  },
});
