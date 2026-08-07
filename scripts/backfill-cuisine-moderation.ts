// One-time backfill: sets moderation_status='approved' on cuisines rows written before
// that column existed (they have moderation_status=null, which fails the public
// GET /user/cuisines filter — see cuisines.service.ts). Usage: pnpm db:backfill-cuisine-moderation
import 'dotenv/config';
import { adminContext } from '../src/lib/adapter';

async function main() {
  const ctx = adminContext();
  const rows = await ctx.table('cuisines').findMany({}) as Record<string, unknown>[];
  const stale = rows.filter((r) => !r.moderation_status);

  for (const row of stale) {
    await ctx.table('cuisines').update({
      where: { cuisine_id: row.cuisine_id as string },
      data: { moderation_status: 'approved' },
    });
  }

  console.log(`Backfilled moderation_status on ${stale.length}/${rows.length} cuisines.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
