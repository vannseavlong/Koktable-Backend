/**
 * Seeds the super-admin account used to log into the admin portal.
 * Email/password come from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD so no
 * real credentials are committed to source.
 *
 * Run: pnpm db:seed seeds/super-admin.ts --skip-existing
 * Then log in via POST /user/auth/login with the same email/password —
 * the resulting JWT (role: 'admin') is accepted by every /admin/* route.
 */
import { hashPassword } from 'longcelot-sheet-db';

export default async function (env: NodeJS.ProcessEnv) {
  const email    = env.SUPER_ADMIN_EMAIL;
  const password = env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set to seed the super-admin account');
  }

  const passwordHash = await hashPassword(password);

  return {
    users: [
      {
        user_id:       'u_super_admin',
        email,
        full_name:     'Restaurant Admin',
        picture:       '',
        role:          'admin',
        auth_provider: 'email',
        status:        'active',
      },
    ],
    credentials: [
      { user_id: 'u_super_admin', password_hash: passwordHash },
    ],
  };
}
