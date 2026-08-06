import { defineTable, string, date } from 'longcelot-sheet-db';

// Audit trail for restaurants.status changes (Overview.md §1.2: "suspend and reactivate
// with a required reason, stored and optionally shown to the merchant"). One row per
// transition; restaurants.suspension_reason holds only the current reason for cheap reads,
// this table holds every past one plus who made each change.
export default defineTable({
  name: 'restaurant_status_history',
  actor: 'admin',
  timestamps: true,
  columns: {
    history_id:    string().required().unique().primary(),
    restaurant_id: string().required().ref('restaurants.restaurant_id'),
    from_status:   string().required(),
    to_status:     string().required(),
    reason:        string(),
    changed_by:    string().required().ref('users.user_id'),
    changed_at:    date().required(),
  },
});
