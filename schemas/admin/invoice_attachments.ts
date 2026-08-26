import { defineTable, string } from 'longcelot-sheet-db';

// Split out from invoices (rather than a JSON array column on it) so a single bill can
// carry more than one file — e.g. the invoice PDF and a payment receipt — without
// packing a repeating group into one cell. 1 invoice : many attachments.
export default defineTable({
  name: 'invoice_attachments',
  actor: 'admin',
  timestamps: true,
  columns: {
    attachment_id: string().required().unique().primary(),
    invoice_id:    string().required().ref('invoices.invoice_id'),
    file_url:      string().required(), // Drive URL via src/utils/fileUpload.ts
    file_name:     string().required(), // original filename, for display/download
    mime_type:     string().required(),
    uploaded_by:   string().required().ref('users.user_id'),
    // 'invoice': the admin-issued bill/receipt document. 'receipt': merchant-submitted
    // proof of payment (POST /merchant/restaurant/invoices/:id/attachments) — kept
    // distinct so the UI never confuses "what we billed" with "what they say they paid".
    kind:          string().enum(['invoice', 'receipt']).default('invoice').required(),
  },
});
