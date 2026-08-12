import { defineTable, string, date } from 'longcelot-sheet-db';

export default defineTable({
  name: 'reservation_forwards',
  actor: 'admin',
  timestamps: true,
  columns: {
    forward_id:     string().required().unique().primary(),
    reservation_id: string().required(),
    user_id:        string().required().ref('users.user_id'),
    restaurant_id:  string().ref('restaurants.restaurant_id'),
    target_name:    string().required(),   // restaurant name as contacted, in case restaurant_id is blank
    target_contact: string(),              // phone/handle/email actually used
    channel:        string().enum(['telegram', 'email', 'call']).required(),
    message:        string(),
    sent_by:        string().required().ref('users.user_id'), // admin who sent it
    sent_at:        date().required(),
    sla_due_at:     date(),
    responded_at:   date(),
    response_status: string().enum(['confirmed', 'declined', 'no_response']),
  },
});
