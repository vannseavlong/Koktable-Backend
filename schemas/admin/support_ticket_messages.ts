import { defineTable, string } from 'longcelot-sheet-db';

// Threaded conversation for one support_tickets row — kept as its own table (1 ticket :
// many messages) rather than growing a field on the ticket itself.
export default defineTable({
  name: 'support_ticket_messages',
  actor: 'admin',
  timestamps: true,
  columns: {
    message_id:      string().required().unique().primary(),
    ticket_id:        string().required().ref('support_tickets.ticket_id'),
    sender_user_id:   string().required().ref('users.user_id'),
    body:             string().required(),
  },
});
