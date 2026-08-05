import { defineTable, string } from 'longcelot-sheet-db';

export default defineTable({
  name: 'users',
  actor: 'admin',
  timestamps: true,
  columns: {
    user_id:       string().required().unique().primary(),
    email:         string().required().unique(),
    full_name:     string().required(),
    picture:       string(),
    role:          string().enum(['user', 'admin', 'merchant']).default('user').required(),
    auth_provider: string().enum(['google', 'email']).required(),
    actor_sheet_id: string(),
    status:        string().enum(['active', 'inactive']).default('active').required(),
  },
});
