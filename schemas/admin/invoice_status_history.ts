import { defineTable, string, date } from 'longcelot-sheet-db';

// Audit trail for invoices.status changes — same pattern as
// restaurant_status_history.ts. One row per transition, including the merchant's own
// "submitted a receipt" self-transition (pending/failed -> submitted), so admins can
// see exactly when a payment was claimed vs. confirmed.
export default defineTable({
  name: 'invoice_status_history',
  actor: 'admin',
  timestamps: true,
  columns: {
    history_id:  string().required().unique().primary(),
    invoice_id:  string().required().ref('invoices.invoice_id'),
    from_status: string().required(),
    to_status:   string().required(),
    changed_by:  string().required().ref('users.user_id'),
    changed_at:  date().required(),
  },
});
