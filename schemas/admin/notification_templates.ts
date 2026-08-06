import { defineTable, string, boolean } from 'longcelot-sheet-db';

// Booking confirmation, admin approval, suspension notice, etc. (Overview.md §1.5).
// `key` (e.g. 'booking_confirmed', 'restaurant_suspended') + `channel` together identify
// a template — no composite unique for the same single-column-.unique() reason as
// role_permissions.ts; the service layer should upsert on (key, channel) rather than rely
// on a DB constraint. body supports {{placeholder}} tokens resolved by the sending code.
export default defineTable({
  name: 'notification_templates',
  actor: 'admin',
  timestamps: true,
  columns: {
    template_id: string().required().unique().primary(),
    key:         string().required(),
    channel:     string().enum(['email', 'sms', 'telegram']).required(),
    subject:     string(), // blank for sms/telegram
    body:        string().required(),
    active:      boolean().default(true).required(),
  },
});
