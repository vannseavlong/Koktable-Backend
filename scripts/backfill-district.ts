/**
 * One-time backfill: derives `district_id` on restaurant_locations rows that have a
 * `google_place_id` and a `city_id` but no `district_id` yet, by calling the Google Places
 * Details API for that place, reading its sublocality/neighborhood address_component, and
 * resolving that name to a row in the `districts` lookup table (schemas/admin/districts.ts)
 * — creating one if this is the first location seen in that city/district combination.
 * Same source (`google_place_id`) the original directory import used for
 * rating/price_level/images — this re-queries Places rather than reverse-geocoding raw
 * lat/long, since Places' sublocality/neighborhood components are closer to how people
 * actually search a neighborhood than a bare reverse-geocode.
 *
 * Writes straight through the live sheet via the adapter (small dataset, ~100 rows —
 * see restaurant_locations row count — so a per-row API write here doesn't come close to
 * Sheets API rate limits, unlike a bulk TSV-paste import).
 *
 * Requires GOOGLE_PLACES_API_KEY (see .env.example) — a Maps Platform API key with the
 * Places API enabled, separate from GOOGLE_CLIENT_ID/SECRET (those are OAuth2 credentials,
 * not usable for Places calls). Run `pnpm db:sync` first if the `districts` table /
 * `district_id` column don't exist in the live sheet yet (schemas/admin/districts.ts,
 * schemas/admin/restaurant_locations.ts).
 *
 * Usage:
 *   pnpm exec tsx scripts/backfill-district.ts            # writes district_id to the sheet
 *   pnpm exec tsx scripts/backfill-district.ts --dry-run   # fetches + logs only, no writes
 */
import 'dotenv/config';
import { nanoid } from 'nanoid';
import { adminContext } from '../src/lib/adapter';

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Google Places' own ordering of specificity for "neighborhood-shaped" components —
// prefer the narrowest one available (sublocality_level_1 is usually the same value as
// sublocality but not guaranteed, so check both; fall back to the broader `neighborhood`
// type some places carry instead).
const DISTRICT_TYPES = ['sublocality_level_1', 'sublocality', 'neighborhood'];

interface AddressComponent {
  long_name: string;
  types: string[];
}

interface PlaceDetailsResponse {
  status: string;
  error_message?: string;
  result?: { address_components?: AddressComponent[] };
}

async function fetchDistrict(placeId: string): Promise<string | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'address_component');
  url.searchParams.set('key', PLACES_API_KEY!);

  const res = await fetch(url);
  const json = (await res.json()) as PlaceDetailsResponse;

  if (json.status !== 'OK') {
    throw new Error(`Places API ${json.status}: ${json.error_message ?? '(no message)'}`);
  }

  const components = json.result?.address_components ?? [];
  for (const type of DISTRICT_TYPES) {
    const match = components.find((c) => c.types.includes(type));
    if (match) return match.long_name;
  }
  return null;
}

// Resolves a (city_id, district name) pair to a district_id, creating the districts row
// the first time that combination is seen. A district name isn't globally unique (e.g.
// "Riverside" exists in more than one city), so the cache key — and the lookup itself —
// is scoped by city_id, not name alone.
function districtCacheKey(cityId: string, name: string): string {
  return `${cityId}::${name}`;
}

async function resolveDistrictId(
  ctx: ReturnType<typeof adminContext>,
  cache: Map<string, string>,
  cityId: string,
  name: string,
  dryRun: boolean
): Promise<string> {
  const key = districtCacheKey(cityId, name);
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = (await ctx.table('districts').findOne({ where: { city_id: cityId, name } })) as Record<string, unknown> | null;
  if (existing) {
    const id = existing.district_id as string;
    cache.set(key, id);
    return id;
  }

  const district_id = `dist_${nanoid(10)}`;
  if (!dryRun) {
    await ctx.table('districts').create({ district_id, city_id: cityId, name });
  }
  cache.set(key, district_id);
  return district_id;
}

async function main() {
  if (!PLACES_API_KEY) {
    console.error('❌ GOOGLE_PLACES_API_KEY is required — see .env.example');
    process.exit(1);
  }

  const dryRun = process.argv.includes('--dry-run');
  const ctx = adminContext();
  const rows = (await ctx.table('restaurant_locations').findMany({})) as Record<string, unknown>[];
  const targets = rows.filter((r) => r.google_place_id && !r.district_id);
  const noCityId = targets.filter((r) => !r.city_id);

  console.log(
    `${targets.length} of ${rows.length} location(s) have a google_place_id and no district_id yet` +
      (dryRun ? ' (dry run — nothing will be written)' : '') +
      '\n'
  );
  if (noCityId.length > 0) {
    console.log(`  ⚠ ${noCityId.length} of those have no city_id set — can't resolve a district within an unknown city, skipping them.\n`);
  }

  const districtCache = new Map<string, string>();
  let updated = 0;
  let skipped = 0;
  for (const row of targets) {
    const locationId = row.location_id as string;
    const placeId = row.google_place_id as string;
    const cityId = row.city_id as string | undefined;
    if (!cityId) {
      skipped++;
      continue;
    }
    try {
      const districtName = await fetchDistrict(placeId);
      if (!districtName) {
        console.log(`  – ${locationId} (city_id=${cityId}): no sublocality/neighborhood in the Places response`);
        skipped++;
      } else {
        const district_id = await resolveDistrictId(ctx, districtCache, cityId, districtName, dryRun);
        console.log(`  ✓ ${locationId} (city_id=${cityId}): ${districtName} → ${district_id}`);
        if (!dryRun) {
          await ctx.table('restaurant_locations').update({ where: { location_id: locationId }, data: { district_id } });
        }
        updated++;
      }
    } catch (err) {
      console.error(`  ✖ ${locationId}: ${err instanceof Error ? err.message : err}`);
      skipped++;
    }
    // Stay well clear of Places API rate limits — this is a one-off script, not a hot path.
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  console.log(`\nDone. ${updated} ${dryRun ? 'would be updated' : 'updated'}, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
