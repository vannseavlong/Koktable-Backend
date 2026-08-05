import { defineTable, string } from 'longcelot-sheet-db';

export default defineTable({
  name: 'profile',
  actor: 'user',
  timestamps: true,
  columns: {
    user_id:    string().required().unique().primary(),
    full_name:  string().required(),
    email:      string().required().unique(),
    phone:      string(),
    avatar_url: string(),
    bio:        string(),
  },
});
