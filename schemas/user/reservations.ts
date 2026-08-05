import { defineTable, string, number, date } from 'longcelot-sheet-db';

export default defineTable({
  name: 'reservations',
  actor: 'user',
  timestamps: true,
  softDelete: true,
  columns: {
    reservation_id:   string().required().unique().primary(),
    guest_name:     string().required(),
    party_size:     number().min(1).required(),
    // No .ref('services.service_id') — this column now also holds a catalog_items.item_id
    // value for reservations created via the item_id path (see reservations.service.ts), so a hard
    // FK to `services` alone would reject those writes with a false-positive violation.
    service_id:   string().required(),
    service_name: string().required(),
    start_date:   date().required(),
    end_date:     date().required(),
    daily_rate:   number().min(0).required(),
    notes:        string(),
    status:       string().enum(['pending', 'confirmed', 'active', 'completed', 'cancelled']).default('pending').required(),
    // Denormalized from the catalog item's restaurant at reservation-creation time (mirrors
    // service_name above). Populated when POST /user/reservations is passed `item_id`
    // (a restaurant-scoped catalog_items row) instead of `service_id`; stays blank for
    // reservations against the legacy single-restaurant `services` table. See reservations.service.ts.
    restaurant_id:      string(),
  },
});
