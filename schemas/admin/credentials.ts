import { defineTable, string } from 'longcelot-sheet-db';

// Stores email+password credentials separately from the users table.
// Google OAuth users have no row here.
export default defineTable({
  name: 'credentials',
  actor: 'admin',
  timestamps: true,
  columns: {
    user_id:       string().required().unique().primary().ref('users.user_id'),
    password_hash: string().required(),
  },
});
