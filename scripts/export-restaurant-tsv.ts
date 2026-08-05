/**
 * Exports the restaurants/restaurant_locations/restaurant_cuisines/restaurant_hours
 * (plus cuisines) seed data as one TSV file per table, columns in the exact order
 * `lsdb sync` writes them (schema declaration order, then _created_at, _updated_at, _id) —
 * ready to paste directly under each tab's header row in the Google Sheet, no API calls.
 *
 * Run `pnpm db:sync` FIRST so the tabs/headers actually exist to paste into — this only
 * produces the row data, it doesn't touch the live sheet.
 *
 * Usage: pnpm exec tsx scripts/export-restaurant-tsv.ts <output-dir>
 */
import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import cuisinesSeed from '../seeds/cuisines';
import restaurantsSeed from '../seeds/restaurants';

const outDir = process.argv[2] ?? path.join(__dirname, '..', 'tmp-sheet-export');
fs.mkdirSync(outDir, { recursive: true });

const now = new Date().toISOString();

// Sheets (like Excel) treats a cell starting with =, +, -, or @ as the start of a
// formula — "+855 12 539 977" (a phone number) parses as an invalid formula and errors
// on paste. A leading single quote forces "plain text" and is stripped from the
// displayed value, same trick spreadsheet apps use for CSV-injection-safe exports.
function escapeFormulaTrigger(text: string): string {
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function cell(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  // Never escape genuine numbers (e.g. a negative longitude) — Sheets reads a bare
  // numeric literal as a number regardless of a leading "-", only text masquerading
  // as one (like a phone number) needs the quote.
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') return escapeFormulaTrigger(JSON.stringify(value));
  return escapeFormulaTrigger(String(value));
}

function writeTsv(fileName: string, columns: string[], rows: Record<string, unknown>[]) {
  const lines = [columns.join('\t')];
  for (const row of rows) {
    lines.push(columns.map((c) => cell(row[c])).join('\t'));
  }
  fs.writeFileSync(path.join(outDir, fileName), lines.join('\n') + '\n');
  console.log(`  ${fileName}: ${rows.length} row(s)`);
}

const withBookkeeping = <T extends Record<string, unknown>>(rows: T[]) =>
  rows.map((r) => ({ ...r, _created_at: now, _updated_at: now, _id: nanoid(12) }));

console.log(`Writing TSV files to ${outDir}\n`);

writeTsv(
  'cuisines.tsv',
  ['cuisine_id', 'name', 'icon', 'active', 'sort_order', '_created_at', '_updated_at', '_id'],
  withBookkeeping(cuisinesSeed.cuisines)
);

writeTsv(
  'restaurants.tsv',
  ['restaurant_id', 'application_id', 'owner_user_id', 'category_id', 'name', 'description', 'logo', 'banner', 'status', '_created_at', '_updated_at', '_id'],
  withBookkeeping(restaurantsSeed.restaurants)
);

writeTsv(
  'restaurant_locations.tsv',
  ['location_id', 'restaurant_id', 'name', 'contact_email', 'contact_phone', 'address', 'city', 'latitude', 'longitude', 'active', 'rating', 'rating_count', 'price_level', 'price_symbol', 'images', 'google_place_id', '_created_at', '_updated_at', '_id'],
  withBookkeeping(restaurantsSeed.restaurant_locations.map((l) => ({ active: true, ...l })))
);

writeTsv(
  'restaurant_cuisines.tsv',
  ['restaurant_cuisine_id', 'restaurant_id', 'cuisine_id', '_created_at', '_updated_at', '_id'],
  withBookkeeping(restaurantsSeed.restaurant_cuisines)
);

writeTsv(
  'restaurant_hours.tsv',
  ['hours_id', 'restaurant_id', 'location_id', 'day_of_week', 'closed', 'open_24h', 'periods', '_created_at', '_updated_at', '_id'],
  withBookkeeping(restaurantsSeed.restaurant_hours)
);

console.log('\nDone.');
