import { defineTable, string } from 'longcelot-sheet-db';
import { localeColumns } from '../lib/i18n';

// A merchant's restaurant brand. Physical-site facts (address, contact, rating,
// price, Google Places data) live on restaurant_locations — a restaurant can have
// more than one. Cuisine lives on restaurant_cuisines (many-to-many).
export default defineTable({
  name: 'restaurants',
  actor: 'admin',
  timestamps: true,
  columns: {
    restaurant_id:  string().required().unique().primary(),
    application_id: string().ref('merchant_applications.application_id'),
    owner_user_id:  string(),
    category_id:    string().ref('categories.category_id'),
    name:           string().required(),
    ...localeColumns('name'),
    description:    string(),
    ...localeColumns('description'),
    logo:           string(),
    banner:         string(),
    status:         string().enum(['pending', 'active', 'suspended']).default('pending').required(),
    // Current reason, kept in sync with `status` (not derived) — same treatment as
    // `status` itself. Blank once reactivated. Full audit trail (who/when/every past
    // reason) lives in restaurant_status_history, not here.
    suspension_reason: string(),
  },
});
