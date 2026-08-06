/**
 * Sync one or a few named tables to Google Sheets, instead of `pnpm db:sync`'s
 * every-registered-schema sweep. Useful when:
 *   - a full sync partially failed (e.g. hit the Sheets API's per-minute read quota once
 *     the table count got large) and you just want to retry the tables that failed
 *   - you added/changed one table and don't want to re-touch all the others
 *
 * syncSchema() itself is idempotent (checks for missing columns, only writes what's
 * missing) — this script doesn't add any new safety, it just calls it for fewer tables
 * per run, which is what actually avoids re-tripping the quota.
 *
 * Only handles admin-actor tables directly (the common case — most tables in this repo
 * are admin-actor). A user-actor table (profile/reservations) needs `pnpm db:sync
 * --all-users` instead, to push the change to every already-registered user's own sheet;
 * this script isn't a substitute for that.
 *
 * Usage:
 *   pnpm exec tsx scripts/sync-table.ts <table_name> [table_name...]
 *   pnpm exec tsx scripts/sync-table.ts subscriptions users tables support_tickets support_ticket_messages
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { adapter } from '../src/lib/adapter';
import type { TableSchema } from 'longcelot-sheet-db';

function loadSchema(name: string): TableSchema {
  for (const actorDir of ['admin', 'user']) {
    const file = path.join(__dirname, '..', 'schemas', actorDir, `${name}.ts`);
    if (fs.existsSync(file)) {
      const schema = (require(file).default) as TableSchema;
      if (schema.actor !== 'admin') {
        throw new Error(
          `'${name}' is a user-actor table — use \`pnpm db:sync --all-users\` instead, ` +
          `not this script (see file header).`
        );
      }
      return schema;
    }
  }
  throw new Error(`No schema file found for table '${name}' under schemas/admin/`);
}

async function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    console.error('Usage: pnpm exec tsx scripts/sync-table.ts <table_name> [table_name...]');
    process.exit(1);
  }

  for (const name of names) {
    try {
      const schema = loadSchema(name);
      await adapter.syncSchema(schema);
      console.log(`✅ ${name} synced`);
    } catch (err) {
      console.error(`❌ ${name} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
