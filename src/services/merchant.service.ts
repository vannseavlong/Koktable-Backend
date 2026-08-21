import { nanoid } from 'nanoid';
import { hashPassword, validatePasswordStrength } from 'longcelot-sheet-db';
import { adminContext } from '../lib/adapter';
import { signJwt, type JwtPayload } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { hashInviteToken } from '../lib/inviteToken';
import { withLock } from '../lib/mutex';

interface ApplyInput {
  restaurant_name?: string;
  applicant_name?: string;
  contact_email?: string;
  contact_phone?: string;
  description?: string;
}

export async function apply(input: ApplyInput) {
  const { restaurant_name, applicant_name, contact_email, contact_phone, description } = input;
  if (!restaurant_name)      throw new AppError(400, 'restaurant_name is required');
  if (!applicant_name) throw new AppError(400, 'applicant_name is required');
  if (!contact_email)  throw new AppError(400, 'contact_email is required');

  const ctx = adminContext();

  const existingPending = await ctx.table('merchant_applications').findOne({
    where: { contact_email, status: 'pending' },
  });
  if (existingPending) {
    throw new AppError(409, 'A pending application already exists for this email');
  }

  const application_id = `app_${nanoid(10)}`;
  await ctx.table('merchant_applications').create({
    application_id,
    restaurant_name,
    applicant_name,
    contact_email,
    contact_phone: contact_phone ?? '',
    description:   description ?? '',
    status: 'pending',
  });

  return ctx.table('merchant_applications').findOne({ where: { application_id } });
}

interface InviteInfo {
  restaurant: { name: string; description: string; logo: string };
  email: string;
  expires_at: string;
  account_exists: boolean;
}

// Shared validity check for both GET (preview) and POST (accept) — 404 if the token
// doesn't hash to any known invite, 400 if it's a real invite that's expired/used/
// superseded by a resend (POST /admin/merchant-applications/:id/resend-invite).
async function findValidInvite(token: string) {
  const ctx = adminContext();
  const token_hash = hashInviteToken(token);
  const invite = await ctx.table('merchant_invites').findOne({ where: { token_hash } }) as Record<string, string> | null;

  if (!invite) {
    throw new AppError(404, 'Invite not found');
  }
  if (invite.used_at) {
    throw new AppError(400, 'This invite has already been used');
  }
  if (invite.revoked_at) {
    throw new AppError(400, 'This invite link is no longer valid — check your email for a more recent invite');
  }
  if (new Date(invite.expires_at) <= new Date()) {
    throw new AppError(400, 'This invite has expired');
  }

  return { ctx, invite };
}

export async function getInvite(token: string): Promise<InviteInfo> {
  const { ctx, invite } = await findValidInvite(token);

  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: invite.restaurant_id } }) as Record<string, string> | null;
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }

  const existingUser = await ctx.table('users').findOne({ where: { email: invite.email } });

  return {
    restaurant: { name: restaurant.name, description: restaurant.description, logo: restaurant.logo },
    email: invite.email,
    expires_at: invite.expires_at,
    account_exists: !!existingUser,
  };
}

interface AcceptInviteInput {
  full_name?: string;
  password?: string;
}

// Password-only in Phase 1 — see ADMIN_API.md for the deferred Google-OAuth-invite gap.
export async function acceptInvite(token: string, input: AcceptInviteInput) {
  const { full_name, password } = input;
  if (!full_name) throw new AppError(400, 'full_name is required');
  if (!password)  throw new AppError(400, 'password is required');

  const { valid, errors } = validatePasswordStrength(password);
  if (!valid) {
    throw new AppError(422, 'Weak password', errors);
  }

  // Serialize redemption per token: without this, two concurrent requests for the
  // same (valid, unused) token could both pass findValidInvite's used_at check before
  // either writes, each creating its own merchant account/restaurant-owner update — the
  // "single-use" guarantee only holds if concurrent redemptions can't interleave. This
  // closes the race for this process; see src/lib/mutex.ts for the multi-instance caveat.
  return withLock(`invite-accept:${hashInviteToken(token)}`, async () => {
    const { ctx, invite } = await findValidInvite(token);

    // Email comes from the invite record, never the client — prevents a redeemer from
    // claiming a different account than the one the invite was actually issued to.
    const existingUser = await ctx.table('users').findOne({ where: { email: invite.email } });
    if (existingUser) {
      throw new AppError(409, 'An account with this email already exists');
    }

    // Mark the invite used before creating the account: if something below fails
    // partway, the invite is consumed (fails closed — an admin can re-approve the
    // application) rather than left redeemable a second time.
    await ctx.table('merchant_invites').update({
      where: { invite_id: invite.invite_id },
      data:  { used_at: new Date().toISOString() },
    });

    // Merchants are inserted directly into the shared users table, same as admins —
    // no createUserSheet() call, since merchants don't get a per-user actor sheet.
    const user_id = `m_${nanoid(10)}`;
    await ctx.table('users').create({
      user_id,
      email:          invite.email,
      full_name,
      picture:        '',
      role:           'merchant',
      auth_provider:  'email',
      actor_sheet_id: '',
      status:         'active',
    });

    const hash = await hashPassword(password);
    await ctx.table('credentials').create({ user_id, password_hash: hash });

    await ctx.table('restaurants').update({
      where: { restaurant_id: invite.restaurant_id },
      data:  { owner_user_id: user_id, status: 'active' },
    });

    const user = await ctx.table('users').findOne({ where: { user_id } }) as Record<string, string>;
    const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: invite.restaurant_id } }) as Record<string, string>;

    const payload: Omit<JwtPayload, 'iat'> = {
      user_id:        user.user_id,
      email:          user.email,
      full_name:      user.full_name,
      role:           user.role,
      actor_sheet_id: user.actor_sheet_id,
      restaurant_id:        restaurant.restaurant_id,
    };

    return { token: signJwt(payload), user, restaurant };
  });
}
