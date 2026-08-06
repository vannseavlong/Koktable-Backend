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
    status:           string().enum(['pending', 'paid', 'failed', 'refunded']).default('pending').required(),
    due_date:         date(),
    paid_at:          date(),
    description:      string(), // e.g. "Pro plan — August 2026", "Commission — 42 bookings"
  },
});
