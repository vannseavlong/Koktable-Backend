import { defineTable, string, boolean } from 'longcelot-sheet-db';

// Multi-account support for a restaurant (Overview.md §5: Basic = up to 3 accounts fixed
// Owner/Staff, Pro = unlimited accounts with configurable roles). restaurants.owner_user_id
// stays as-is (the existing invite-accept/auth flow already writes it, unchanged here) —
// the owner's own row also appears here once staff management is in use, so this table is
// the single place that answers "who works at this restaurant, with what role."
// user_id is unique: a staff account belongs to exactly one restaurant in this model.
export default defineTable({
  name: 'restaurant_staff',
  actor: 'admin',
  timestamps: true,
  columns: {
    staff_id:      string().required().unique().primary(),
    restaurant_id: string().required().ref('restaurants.restaurant_id'),
    user_id:       string().required().unique().ref('users.user_id'),
    role_id:       string().required().ref('roles.role_id'),
    active:        boolean().default(true).required(),
  },
});
