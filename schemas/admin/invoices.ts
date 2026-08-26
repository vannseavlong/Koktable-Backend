import { defineTable, string, number, date } from 'longcelot-sheet-db';

export default defineTable({
  name: 'invoices',
  actor: 'admin',
  timestamps: true,
  columns: {
    invoice_id:      string().required().unique().primary(),
    restaurant_id:    string().required().ref('restaurants.restaurant_id'),
    subscription_id:  string().ref('subscriptions.subscription_id'), // blank for a commission-only invoice
    amount:           number().min(0).required(),
    currency:         string().default('USD').required(),
    // 'submitted': merchant attached a receipt (POST /merchant/restaurant/invoices/:id/attachments)
    // and is awaiting admin confirmation — not yet 'paid'.
    status:           string().enum(['pending', 'submitted', 'paid', 'failed', 'refunded']).default('pending').required(),
    // The calendar month this bill covers, e.g. 2026-08-01 / 2026-08-31 for "August
    // 2026" — distinct from due_date/paid_at, which are about when payment happens,
    // not what period is being billed for.
    billing_period_start: date(),
    billing_period_end:   date(),
    due_date:         date(),
    paid_at:          date(),
    description:      string(), // e.g. "Pro plan — August 2026", "Commission — 42 bookings"
  },
});
