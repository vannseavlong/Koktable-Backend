// Shared between seeds/cuisines.ts (generates cuisine_id for the canonical list) and
// seeds/restaurants.ts (generates the matching cuisine_id when linking a restaurant to
// one) — both must derive the same id from the same name for the FK to line up.
export function cuisineSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
}
