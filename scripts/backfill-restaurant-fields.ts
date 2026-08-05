/**
 * One-time backfill for restaurants rows written before hours/price_symbol were
 * derived consistently (see src/utils/restaurantHours.ts, src/utils/restaurantPricing.ts):
 *   - hours: filled in from opening_hours where hours is blank (bulk-imported restaurants
 *     only ever had opening_hours set, so a client reading `hours` alone saw it blank).
 *   - price_symbol: recomputed from price_level for every row that has a price_level, so
 *     no row can have a stale/inconsistent price_symbol going forward.
 * Safe to run more than once — it's a no-op for rows that already match.
 *
 * Usage: pnpm db:backfill-restaurant-fields [--dry-run]
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createSheetAdapter } from 'longcelot-sheet-db';
import restaurantsSchema from '../schemas/admin/restaurants';
import { priceLevelToSymbol } from '../src/utils/restaurantPricing';
import { summarizeOpeningHours } from '../src/utils/restaurantHours';

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'ADMIN_SHEET_ID'];
  for (const v of required) {
    if (!process.env[v]) { console.error(`❌ Missing env var: ${v}`); process.exit(1); }
  }

  const tokensPath = [
    path.join(process.cwd(), '.lsdb-tokens.json'),
    path.join(process.cwd(), '.sheet-db-tokens.json'),
  ].find(fs.existsSync);
  if (!tokensPath) {
    console.error('❌ No OAuth tokens found. Run: pnpm db:sync'); process.exit(1);
  }
  const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf-8'));

  const adapter = createSheetAdapter({
    adminSheetId: process.env.ADMIN_SHEET_ID!,
    credentials: {
      clientId:     process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri:  process.env.GOOGLE_REDIRECT_URI!,
    },
    tokens,
  });
  adapter.registerSchemas([restaurantsSchema]);

  const adminCtx = adapter.withContext({
    userId:       'backfill-cli',
    actor:        'admin',
    actorSheetId: process.env.ADMIN_SHEET_ID!,
  });

  const restaurants = await adminCtx.table('restaurants').findMany({}) as Record<string, unknown>[];
  console.log(`\n🔧 Scanning ${restaurants.length} restaurant(s)${dryRun ? ' (dry run)' : ''}...\n`);

  let hoursFixed = 0;
  let priceFixed = 0;

  for (const r of restaurants) {
    const data: Record<string, unknown> = {};

    if (!r.hours) {
      const summarized = summarizeOpeningHours(r.opening_hours);
      if (summarized) data.hours = summarized;
    }

    const derivedSymbol = priceLevelToSymbol(r.price_level);
    if (derivedSymbol !== undefined && derivedSymbol !== r.price_symbol) {
      data.price_symbol = derivedSymbol;
    }

    if (Object.keys(data).length === 0) continue;

    if (data.hours) hoursFixed++;
    if (data.price_symbol) priceFixed++;

    console.log(`  ${dryRun ? 'would update' : 'updating'} ${r.restaurant_id} (${r.name}):`, data);
    if (!dryRun) {
      await adminCtx.table('restaurants').update({ where: { restaurant_id: r.restaurant_id as string }, data });
    }
  }

  console.log(`\nDone. hours backfilled: ${hoursFixed}, price_symbol corrected: ${priceFixed}.`);
  if (dryRun) console.log('(dry run — no writes made; rerun without --dry-run to apply)');
}

main().catch((err) => { console.error(err); process.exit(1); });
