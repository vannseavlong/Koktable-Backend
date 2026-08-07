// Canonical cuisine vocabulary — derived from the distinct cuisine names already present
// in resteruant.json's restaurant_cuisines array, so this list always covers whatever
// seeds/restaurants.ts actually links a restaurant to. Run before seeds/restaurants.ts
// (restaurant_cuisines.cuisine_id refs this table).
//
// Run: pnpm db:seed seeds/cuisines.ts --skip-existing

import restaurantData from '../resteruant.json';
import { cuisineSlug } from './shared/cuisineSlug';

const names = [...new Set(restaurantData.restaurant_cuisines.map((rc) => rc.cuisine))].sort();

const cuisines = names.map((name, index) => ({
  cuisine_id: cuisineSlug(name),
  name,
  active: true,
  sort_order: index,
  moderation_status: 'approved',
}));

export default { cuisines };
