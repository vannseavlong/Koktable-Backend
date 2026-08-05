/**
 * Seeds 3 test user accounts into the admin sheet.
 * All users share DEV_USER_SHEET_ID as their actor sheet (fine for local testing).
 *
 * Login credentials after seeding:
 *   jamie@test.local  / Test1234!
 *   taylor@test.local / Test1234!
 *   morgan@test.local / Test1234!
 *
 * Run: pnpm db:seed seeds/test-users.ts --skip-existing
 */
import { hashPassword } from 'longcelot-sheet-db';

export default async function (env: NodeJS.ProcessEnv) {
  const devSheetId = env.DEV_USER_SHEET_ID ?? '';
  const pw = await hashPassword('Test1234!');

  return {
    users: [
      {
        user_id:        'u_test_001',
        email:          'jamie@test.local',
        full_name:      'Jamie Rivera',
        picture:        '',
        role:           'user',
        auth_provider:  'email',
        actor_sheet_id: devSheetId,
        status:         'active',
      },
      {
        user_id:        'u_test_002',
        email:          'taylor@test.local',
        full_name:      'Taylor Nguyen',
        picture:        '',
        role:           'user',
        auth_provider:  'email',
        actor_sheet_id: devSheetId,
        status:         'active',
      },
      {
        user_id:        'u_test_003',
        email:          'morgan@test.local',
        full_name:      'Morgan Chen',
        picture:        '',
        role:           'user',
        auth_provider:  'email',
        actor_sheet_id: devSheetId,
        status:         'active',
      },
    ],
    credentials: [
      { user_id: 'u_test_001', password_hash: pw },
      { user_id: 'u_test_002', password_hash: pw },
      { user_id: 'u_test_003', password_hash: pw },
    ],
  };
}
