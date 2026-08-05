import { userContext, adminContext } from '../lib/adapter';
import { AppError } from '../utils/AppError';
import type { JwtPayload } from '../middleware/auth';

interface ProfileUpdateInput {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
}

export async function getProfile(user: JwtPayload) {
  const { user_id, actor_sheet_id, full_name, email } = user;

  if (!actor_sheet_id) {
    throw new AppError(422, 'User account has no associated sheet. Please contact support.');
  }

  const ctx     = userContext(user_id, actor_sheet_id);
  let   profile = await ctx.table('profile').findOne({ where: { user_id } }) as Record<string, unknown> | null;

  // Auto-create profile row on first access
  if (!profile) {
    await ctx.table('profile').create({ user_id, full_name, email });
    profile = await ctx.table('profile').findOne({ where: { user_id } }) as Record<string, unknown>;
  }

  // Augment with read-only account info from admin sheet
  const adminCtx = adminContext();
  const account  = await adminCtx.table('users').findOne({ where: { user_id } }) as Record<string, unknown> | null;

  return {
    ...profile,
    role:          account?.role,
    auth_provider: account?.auth_provider,
    status:        account?.status,
  };
}

export async function updateProfile(user: JwtPayload, updates: ProfileUpdateInput) {
  const { user_id, actor_sheet_id } = user;

  if (!actor_sheet_id) {
    throw new AppError(422, 'User account has no associated sheet.');
  }

  const { full_name, phone, avatar_url, bio } = updates;
  const data: Record<string, unknown> = {};
  if (full_name  !== undefined) data.full_name  = full_name;
  if (phone      !== undefined) data.phone      = phone;
  if (avatar_url !== undefined) data.avatar_url = avatar_url;
  if (bio        !== undefined) data.bio        = bio;

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  const ctx = userContext(user_id, actor_sheet_id);

  // Ensure profile row exists
  const existing = await ctx.table('profile').findOne({ where: { user_id } });
  if (!existing) {
    await ctx.table('profile').create({ user_id, full_name: user.full_name, email: user.email });
  }

  await ctx.table('profile').update({ where: { user_id }, data });

  // Sync full_name to admin users table if changed
  if (data.full_name) {
    const adminCtx = adminContext();
    await adminCtx.table('users').update({ where: { user_id }, data: { full_name: data.full_name } });
  }

  return ctx.table('profile').findOne({ where: { user_id } });
}
