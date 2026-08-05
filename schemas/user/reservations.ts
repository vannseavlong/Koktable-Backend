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
    // Required for the legacy service_id/item_id stay-based modes; the restaurant_id-only
    // mode (see reservations.service.ts) defaults end_date to start_date and daily_rate to 0
    // when omitted, so these can't stay hard-required at the schema level.
    end_date:     date(),
    daily_rate:   number().min(0),
    // Wall-clock time slot (e.g. "19:30"), only meaningful for the restaurant_id-only
    // table-reservation mode — blank for the legacy stay-based service_id/item_id modes.
    reservation_time: string(),
    notes:        string(),
    status:       string().enum(['pending', 'confirmed', 'active', 'completed', 'cancelled']).default('pending').required(),
    // Denormalized from the catalog item's restaurant at reservation-creation time (mirrors
    // service_name above). Populated when POST /user/reservations is passed `item_id`
    // (a restaurant-scoped catalog_items row) instead of `service_id`; stays blank for
    // reservations against the legacy single-restaurant `services` table. See reservations.service.ts.
    restaurant_id:      string(),
  },
});
