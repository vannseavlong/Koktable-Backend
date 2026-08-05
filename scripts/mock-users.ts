/**
 * Creates N mock user accounts for local development/testing.
 *
 * Usage: pnpm db:mock-users [count]   (default: 3)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createSheetAdapter } from 'longcelot-sheet-db';
import { nanoid } from 'nanoid';
import usersSchema       from '../schemas/admin/users';
import credentialsSchema from '../schemas/admin/credentials';
import servicesSchema    from '../schemas/admin/services';
import profileSchema     from '../schemas/user/profile';
import reservationsSchema    from '../schemas/user/reservations';

const mockNames = [
  { full_name: 'Jamie Rivera',  email: `jamie.${nanoid(5)}@mock.local` },
  { full_name: 'Taylor Nguyen', email: `taylor.${nanoid(5)}@mock.local` },
  { full_name: 'Morgan Chen',   email: `morgan.${nanoid(5)}@mock.local` },
  { full_name: 'Alex Patel',    email: `alex.${nanoid(5)}@mock.local` },
  { full_name: 'Sam Okonkwo',   email: `sam.${nanoid(5)}@mock.local` },
];

async function main() {
  const count = Number(process.argv[2]) || 3;

  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'ADMIN_SHEET_ID', 'SUPER_ADMIN_EMAIL'];
  for (const v of required) {
    if (!process.env[v]) { console.error(`❌ Missing env var: ${v}`); process.exit(1); }
  }

  // lsdb writes .lsdb-tokens.json; fall back to the pre-0.1.26 filename for older token files.
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
  adapter.registerSchemas([usersSchema, credentialsSchema, servicesSchema, profileSchema, reservationsSchema]);

  // Must use admin context so hasPermission() passes for the 'users' table
  const adminCtx = adapter.withContext({
    userId:       'mock-cli',
    actor:        'admin',
    actorSheetId: process.env.ADMIN_SHEET_ID!,
  });

  console.log(`\n🧪 Creating ${count} mock user(s)...\n`);

  let created = 0;
  for (let i = 0; i < count; i++) {
    const userId = `u_mock_${nanoid(8)}`;
    const { full_name, email } = mockNames[i % mockNames.length];

    try {
      const sheetId = await adminCtx.createUserSheet(userId, 'user', email, {
        extraFields: {
          full_name,
          auth_provider: 'email',
        },
      }) as string;

      // Seed a profile row in the user's own sheet
      const userCtx = adapter.withContext({ userId, actor: 'user', actorSheetId: sheetId });
      await userCtx.table('profile').create({ user_id: userId, full_name, email });

      console.log(`  ✓ ${full_name} <${email}>`);
      console.log(`    user_id: ${userId}  sheet: ${sheetId}\n`);
      created++;
    } catch (err) {
      console.error(`  ✖ Failed for ${email}: ${err}\n`);
    }
  }

  console.log(`Done. ${created}/${count} mock users created.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
