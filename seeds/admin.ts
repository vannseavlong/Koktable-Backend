// Seed data for the admin sheet.
// Run: pnpm db:seed seeds/admin.ts --skip-existing
//
// color values are the card background hex used by the home screen grid

export default {
  // Seeded first so services/restaurants/catalog_items below can .ref() these ids.
  categories: [
    { category_id: 'cat_fine_dining',   name: 'Fine Dining',    icon: '🍽️', active: true, sort_order: 1 },
    { category_id: 'cat_casual_dining', name: 'Casual Dining',  icon: '🍝', active: true, sort_order: 2 },
    { category_id: 'cat_cafe_bakery',   name: 'Cafe & Bakery',  icon: '☕', active: true, sort_order: 3 },
    { category_id: 'cat_fast_casual',   name: 'Fast Casual',    icon: '🍔', active: true, sort_order: 4 },
    { category_id: 'cat_bar_lounge',    name: 'Bar & Lounge',   icon: '🍸', active: true, sort_order: 5 },
    { category_id: 'cat_private_event', name: 'Private Events', icon: '🎉', active: true, sort_order: 6 },
    { category_id: 'cat_delivery',      name: 'Delivery & Takeout', icon: '🥡', active: true, sort_order: 7 },
  ],
  services: [
    {
      service_id:  'svc_table_reservation',
      name:        'Table Reservation',
      description: 'Reserve a table for your party at your preferred date and time.',
      price_from:  0,
      icon:        'table_restaurant',
      color:       '#D6EAE4',   // mint green
      category_id: 'cat_casual_dining',
      active:      true,
      sort_order:  1,
    },
    {
      service_id:  'svc_private_dining',
      name:        'Private Dining Room',
      description: 'Book an exclusive room for a private party or business dinner.',
      price_from:  150,
      icon:        'meeting_room',
      color:       '#F2E4D8',   // warm peach
      category_id: 'cat_private_event',
      active:      true,
      sort_order:  2,
    },
    {
      service_id:  'svc_tasting_menu',
      name:        "Chef's Tasting Menu",
      description: 'A multi-course seasonal tasting menu, reserved in advance.',
      price_from:  85,
      icon:        'restaurant_menu',
      color:       '#D6EAE4',   // mint green
      category_id: 'cat_fine_dining',
      active:      true,
      sort_order:  3,
    },
    {
      service_id:  'svc_event_package',
      name:        'Birthday & Event Package',
      description: 'A reserved table with decorations and a custom set menu for celebrations.',
      price_from:  200,
      icon:        'celebration',
      color:       '#E4DFF2',   // soft lavender
      category_id: 'cat_private_event',
      active:      true,
      sort_order:  4,
    },
    {
      service_id:  'svc_catering',
      name:        'Catering',
      description: 'Off-site catering for your event, priced per guest.',
      price_from:  30,
      icon:        'food_bank',
      color:       '#F2E4D8',   // warm peach
      category_id: 'cat_private_event',
      active:      true,
      sort_order:  5,
    },
    {
      service_id:  'svc_delivery',
      name:        'Delivery',
      description: 'Door-to-door delivery from our kitchen to your address.',
      price_from:  8,
      icon:        'delivery_dining',
      color:       '#D6EAE4',   // mint green
      category_id: 'cat_delivery',
      active:      true,
      sort_order:  6,
    },
  ],
  // Starter Basic/Pro definitions — previously a hardcoded TIER_FEATURES const in
  // Portal's my-billing/index.tsx, now real admin-editable data (ADMIN_API.md § 13).
  // Prices are placeholders; adjust via PATCH /admin/plans/:id once real pricing is set.
  plans: [
    {
      plan_id:                 'plan_basic',
      tier:                    'basic',
      name:                    'Basic',
      price_monthly:           0,
      price_annual:            0,
      max_locations:           1,
      features:                ['1 location', 'Standard listing', 'Basic analytics'],
      active:                  true,
      sort_order:              1,
    },
    {
      plan_id:                 'plan_pro',
      tier:                    'pro',
      name:                    'Pro',
      price_monthly:           49,
      price_annual:            490,
      features: [
        'Unlimited locations',
        'Standard listing',
        'Featured/promoted eligible',
        'Full analytics',
      ],
      active:                  true,
      sort_order:              2,
    },
  ],
};
