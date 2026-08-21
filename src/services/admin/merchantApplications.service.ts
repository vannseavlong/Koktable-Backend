import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { generateInviteToken, INVITE_TOKEN_TTL_MS } from '../../lib/inviteToken';
import { sendMerchantInviteEmail } from '../email.service';
import { env } from '../../config/env';
import { withLock } from '../../lib/mutex';
import * as subscriptionsService from './subscriptions.service';

interface ListApplicationsQuery {
  status?: string;
}

async function findApplication(id: string) {
  const ctx = adminContext();
  const application = await ctx.table('merchant_applications').findOne({ where: { application_id: id } }) as Record<string, string> | null;
  if (!application) {
    throw new AppError(404, 'Application not found');
  }
  return { ctx, application };
}

type Ctx = ReturnType<typeof adminContext>;

// Shared by approve() (first invite) and resendInvite() (every invite after): create
// a fresh single-use token, email it, return only what's safe to put in an API
// response (the raw token itself never leaves this function).
async function issueInvite(ctx: Ctx, restaurant: Record<string, string>, application: Record<string, string>) {
  const { raw, hash } = generateInviteToken();
  const expires_at = new Date(Date.now() + INVITE_TOKEN_TTL_MS).toISOString();

  await ctx.table('merchant_invites').create({
    invite_id:  `inv_${nanoid(10)}`,
    restaurant_id:    restaurant.restaurant_id,
    email:      application.contact_email,
    token_hash: hash,
    expires_at,
    used_at:    '',
    revoked_at: '',
  });

  const inviteUrl = `${env.merchantFrontendUrl}/invite/${raw}`;
  await sendMerchantInviteEmail(application.contact_email, application.restaurant_name, inviteUrl);

  return { expires_at };
}

// Shared by approve()'s idempotent-reuse path and resendInvite(): mark every
// currently-live (not used, not already revoked) invite for a restaurant as revoked, so an
// old emailed link stops working once a fresher one is about to be issued. Filtered
// in JS, not via `where: { used_at: '', revoked_at: '' }` — a blank cell round-trips
// from live Google Sheets as `null`, not `''`, so an exact-match `where` on '' silently
// matches nothing against real data (caught by live testing, not the fake-adapter
// test suite — see src/testUtils/fakeAdapter.ts's blank-cell normalization).
async function revokeLiveInvites(ctx: Ctx, restaurantId: string): Promise<void> {
  const allInvites = await ctx.table('merchant_invites').findMany({ where: { restaurant_id: restaurantId } }) as Record<string, string>[];
  const liveInvites = allInvites.filter((inv) => !inv.used_at && !inv.revoked_at);
  const revoked_at = new Date().toISOString();
  await Promise.all(liveInvites.map((inv) =>
    ctx.table('merchant_invites').update({ where: { invite_id: inv.invite_id }, data: { revoked_at } })
  ));
}

export async function list(query: ListApplicationsQuery) {
  const ctx = adminContext();
  const where: Record<string, unknown> = {};
  if (query.status) where.status = query.status;

  const applications = await ctx.table('merchant_applications').findMany({
    where, orderBy: '_created_at', order: 'desc',
  });
  return { applications };
}

export async function getById(id: string) {
  const { application } = await findApplication(id);
  return application;
}

// Serialized per application_id: without this, two concurrent approve() calls for the
// same still-`pending` application (a double-click, a client retry after a slow
// response) could both pass the status check before either writes, each creating its
// own `restaurants` row for the one application — the same class of bug as a stale manual
// "reset to pending, re-approve" edit (see the idempotent restaurant-reuse check below),
// just triggered by timing instead of by hand.
export async function approve(id: string) {
  return withLock(`merchant-approve:${id}`, async () => {
    const { ctx, application } = await findApplication(id);
    if (application.status !== 'pending') {
      throw new AppError(409, `Cannot approve an application with status ${application.status}`);
    }

    // Idempotent restaurant creation: if a restaurant already exists for this application_id — an
    // application manually reset to `pending` and re-approved being the only way that
    // can currently happen — reuse it instead of creating a duplicate. Revoke its live
    // invites first, same as a resend, since we're about to issue a fresh one.
    let restaurant = await ctx.table('restaurants').findOne({ where: { application_id: id } }) as Record<string, string> | null;
    if (restaurant) {
      await revokeLiveInvites(ctx, restaurant.restaurant_id);
    } else {
      const restaurant_id = `restaurant_${nanoid(10)}`;
      await ctx.table('restaurants').create({
        restaurant_id,
        application_id: id,
        owner_user_id:  '',
        name:           application.restaurant_name,
        description:    application.description ?? '',
        logo:           '',

        status:         'unclaimed',
      });
      await ctx.table('restaurant_locations').create({
        location_id:    `loc_${nanoid(10)}`,
        restaurant_id,
        contact_email:  application.contact_email,
        contact_phone:  application.contact_phone ?? '',
      });
      restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id } }) as Record<string, string>;
    }

    // Auto-enrolls the restaurant in the free-Pro-trial funnel (Overview.md §7.2).
    // Idempotent — a no-op on the reused-restaurant branch above, which already has one.
    await subscriptionsService.ensureForRestaurant(restaurant.restaurant_id);

    await ctx.table('merchant_applications').update({ where: { application_id: id }, data: { status: 'approved' } });

    const invite = await issueInvite(ctx, restaurant, application);
    const updatedApplication = await ctx.table('merchant_applications').findOne({ where: { application_id: id } });

    return { application: updatedApplication, restaurant, invite };
  });
}

export async function resendInvite(id: string) {
  const { ctx, application } = await findApplication(id);
  if (application.status !== 'approved') {
    throw new AppError(409, `Cannot resend an invite for an application with status ${application.status}`);
  }

  const restaurant = await ctx.table('restaurants').findOne({ where: { application_id: id } }) as Record<string, string> | null;
  if (!restaurant) {
    throw new AppError(404, 'No restaurant found for this application');
  }
  if (restaurant.status !== 'unclaimed') {
    throw new AppError(409, `Cannot resend an invite for a restaurant with status ${restaurant.status} — it has already been activated or suspended`);
  }

  await revokeLiveInvites(ctx, restaurant.restaurant_id);
  const invite = await issueInvite(ctx, restaurant, application);

  return { application, restaurant, invite };
}

export async function reject(id: string, reason?: string) {
  const { ctx, application } = await findApplication(id);
  if (application.status !== 'pending') {
    throw new AppError(409, `Cannot reject an application with status ${application.status}`);
  }

  await ctx.table('merchant_applications').update({
    where: { application_id: id },
    data:  { status: 'rejected', rejection_reason: reason ?? '' },
  });

  return ctx.table('merchant_applications').findOne({ where: { application_id: id } });
}
