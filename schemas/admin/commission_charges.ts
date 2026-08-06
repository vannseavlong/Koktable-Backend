import { defineTable, string, number } from 'longcelot-sheet-db';

// Per-booking commission ledger (Overview.md §1.5/§6.2) — one row per seated booking, not
// per no-show/cancelled (Overview.md §6.2: "charging for no-shows or cancellations breaks
// trust immediately"), so this table should only ever be written from a reservation
// transitioning into 'completed'. reservation_id/user_id aren't .ref() — same cross-sheet
// limitation as reservation_forwards.reservation_id.
export default defineTable({
  name: 'commission_charges',
  actor: 'admin',
  timestamps: true,
  columns: {
    charge_id:      string().required().unique().primary(),
    restaurant_id:   string().required().ref('restaurants.restaurant_id'),
    reservation_id:  string().required().unique(),
    user_id:         string().required().ref('users.user_id'),
    amount:          number().min(0).required(),
    // Rate actually applied, snapshotted at charge time — subscriptions.commission_rate
    // or the platform default may change later without rewriting past charges.
    rate:            number().min(0).max(1).required(),
    status:          string().enum(['pending', 'invoiced', 'paid']).default('pending').required(),
    invoice_id:      string().ref('invoices.invoice_id'),
  },
});
