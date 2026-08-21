import { nanoid } from 'nanoid';
import {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
} from 'longcelot-sheet-db';
import { adminContext } from '../lib/adapter';
import { signJwt, hashToken, type JwtPayload } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { logger } from '../lib/logger';

interface RegisterInput {
  full_name?: string;
  email?: string;
  password?: string;
}

interface LoginInput {
  email?: string;
  password?: string;
}

interface GoogleProfile {
  email: string;
  name: string;
  picture?: string;
}

function toTokenPayload(user: Record<string, string>): Omit<JwtPayload, 'iat'> {
  return {
    user_id:        user.user_id,
    email:          user.email,
    full_name:      user.full_name,
    role:           user.role,
    actor_sheet_id: user.actor_sheet_id,
  };
}

// Merchants never get a per-user actor sheet; instead their JWT carries the restaurant_id
// of the restaurant they own (restaurants.owner_user_id === user_id), so downstream requests
// don't have to re-resolve it. Exported for reuse by the invite-accept flow
// (src/services/merchant.service.ts), the other place a merchant JWT gets minted.
export async function resolveMerchantRestaurantId(
  ctx: ReturnType<typeof adminContext>,
  userId: string,
): Promise<string | undefined> {
  const restaurant = await ctx.table('restaurants').findOne({ where: { owner_user_id: userId } }) as Record<string, string> | null;
  return restaurant?.restaurant_id;
}

export async function register({ full_name, email, password }: RegisterInput) {
  if (!full_name || !email || !password) {
    throw new AppError(400, 'full_name, email, and password are required');
  }

  const { valid, errors } = validatePasswordStrength(password);
  if (!valid) {
    logger.warn('register_failed', { email, reason: 'weak_password' });
    throw new AppError(422, 'Weak password', errors);
  }

  const ctx = adminContext();

  const existing = await ctx.table('users').findOne({ where: { email } });
  if (existing) {
    logger.warn('register_failed', { email, reason: 'duplicate_email' });
    throw new AppError(409, 'An account with this email already exists');
  }

  const userId = `u_${nanoid(10)}`;
  await ctx.createUserSheet(userId, 'user', email, {
    extraFields: {
      full_name,
      picture:       '',
      auth_provider: 'email',
    },
  });

  const hash = await hashPassword(password);
  await ctx.table('credentials').create({ user_id: userId, password_hash: hash });

  const user = await ctx.table('users').findOne({ where: { user_id: userId } }) as Record<string, string>;
  const token = signJwt(toTokenPayload(user));

  return { token, user };
}

export async function login({ email, password }: LoginInput) {
  if (!email || !password) {
    throw new AppError(400, 'email and password are required');
  }

  const ctx = adminContext();

  const user = await ctx.table('users').findOne({ where: { email } }) as Record<string, string> | null;
  if (!user) {
    logger.warn('login_failed', { email, reason: 'unknown_email' });
    throw new AppError(401, 'Invalid email or password');
  }

  if (user.auth_provider !== 'email') {
    throw new AppError(400, `This account uses ${user.auth_provider} login. Use Google Sign-In instead.`);
  }

  const cred = await ctx.table('credentials').findOne({ where: { user_id: user.user_id } }) as Record<string, string> | null;
  if (!cred) {
    logger.warn('login_failed', { email, reason: 'no_credentials' });
    throw new AppError(401, 'Invalid email or password');
  }

  const valid = await comparePassword(password, cred.password_hash);
  if (!valid) {
    logger.warn('login_failed', { email, reason: 'invalid_password' });
    throw new AppError(401, 'Invalid email or password');
  }

  if (user.status === 'inactive') {
    logger.warn('login_failed', { email, reason: 'inactive_account' });
    throw new AppError(403, 'This account has been deactivated. Contact an admin.');
  }

  const payload = toTokenPayload(user);
  let responseUser: Record<string, unknown> = user;
  if (user.role === 'merchant') {
    const restaurantId = await resolveMerchantRestaurantId(ctx, user.user_id);
    payload.restaurant_id = restaurantId;
    // The frontend never decodes JWTs (see resolveMerchantRestaurantId's callers) — it needs
    // restaurant_id as a plain field on the returned user object, not just embedded in the token.
    responseUser = { ...user, restaurant_id: restaurantId };
  }

  const token = signJwt(payload);
  return { token, user: responseUser };
}

// Records the presented token as revoked (see schemas/admin/revoked_tokens.ts) — the
// JWT scheme is otherwise stateless, so this is the only thing that makes a token stop
// working before a client simply discards it. `token`/`payload` both come from the
// already-`requireAuth`-verified request (auth.controller.ts), not re-verified here.
export async function logout(token: string, payload: JwtPayload): Promise<void> {
  const ctx = adminContext();
  await ctx.table('revoked_tokens').create({
    token_hash: hashToken(token),
    user_id:    payload.user_id,
    expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : '',
  });
  logger.info('token_revoked', { user_id: payload.user_id });
}

export async function getMe(userId: string) {
  const ctx  = adminContext();
  const user = await ctx.table('users').findOne({ where: { user_id: userId } }) as Record<string, string> | null;
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  if (user.role === 'merchant') {
    const restaurantId = await resolveMerchantRestaurantId(ctx, user.user_id);
    return { ...user, restaurant_id: restaurantId };
  }

  return user;
}

// onUser callback for the Google OAuth router — finds or creates the user record.
export async function handleGoogleProfile(profile: GoogleProfile): Promise<Omit<JwtPayload, 'iat'> | null> {
  const ctx = adminContext();
  let user = await ctx.table('users').findOne({ where: { email: profile.email } }) as Record<string, string> | null;

  if (!user) {
    const userId = `u_${nanoid(10)}`;
    await ctx.createUserSheet(userId, 'user', profile.email, {
      extraFields: {
        full_name:     profile.name,
        picture:       profile.picture ?? '',
        auth_provider: 'google',
      },
    });
    user = await ctx.table('users').findOne({ where: { email: profile.email } }) as Record<string, string>;
  }

  if (!user) return null;

  // Can't return null here: this router's registrationPolicy is 'open', so a null
  // return is treated as "unknown user" and falls through to auto-issuing a token
  // for a fresh, unrelated minimal profile rather than rejecting the request. Throwing
  // is the only way this callback can actually block a known-but-inactive account.
  if (user.status === 'inactive') {
    throw new Error('This account has been deactivated. Contact an admin.');
  }

  return toTokenPayload(user);
}

// onUser callback for the Portal's Google OAuth router (admin sign-in page, used by
// both admin and merchant accounts). registrationPolicy: 'login-only'
export async function handleAdminGoogleProfile(profile: GoogleProfile): Promise<Omit<JwtPayload, 'iat'> | null> {
  const ctx  = adminContext();
  const user = await ctx.table('users').findOne({ where: { email: profile.email } }) as Record<string, string> | null;

  if (!user || (user.role !== 'admin' && user.role !== 'merchant') || user.status === 'inactive') return null;

  const payload = toTokenPayload(user);
  if (user.role === 'merchant') {
    payload.restaurant_id = await resolveMerchantRestaurantId(ctx, user.user_id);
  }
  return payload;
}
