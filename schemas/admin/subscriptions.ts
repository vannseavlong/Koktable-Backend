import { defineTable, string, number, date } from 'longcelot-sheet-db';

// One active subscription per restaurant (Overview.md §5/§6). tier lives here, not on
// restaurants — it's a billing fact with its own lifecycle (trial/active/past_due),
// not an intrinsic property of the restaurant itself.
export default defineTable({
  name: 'subscriptions',
  actor: 'admin',
  timestamps: true,
  columns: {
    subscription_id:      string().required().unique().primary(),
    restaurant_id:         string().required().unique().ref('restaurants.restaurant_id'),
    tier:                  string().enum(['basic', 'pro']).default('basic').required(),
    status:                string().enum(['trialing', 'active', 'past_due', 'cancelled']).default('trialing').required(),
    trial_ends_at:         date(),
    current_period_start:  date(),
    current_period_end:    date(),
    // Overrides platform_settings' default commission rate for this restaurant, e.g. a
    // trial-period 0% promo (Overview.md §7.3). Blank = use the platform default.
    commission_rate:       number().min(0).max(1),
  },
});
