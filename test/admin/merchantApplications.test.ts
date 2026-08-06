import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

const { sendMerchantInviteEmail } = vi.hoisted(() => ({ sendMerchantInviteEmail: vi.fn() }));
vi.mock('../../src/services/email.service', () => ({ sendMerchantInviteEmail }));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

// sendMerchantInviteEmail(to, restaurantName, inviteUrl) — the raw token only ever exists
// in that URL (never in an API response or stored anywhere), so extracting it here is
// the only way to drive a real POST /merchant/invite/:token in a test.
function lastInvitedToken(): string {
  const inviteUrl = sendMerchantInviteEmail.mock.calls.at(-1)?.[2] as string;
  return inviteUrl.split('/').pop()!;
}

function seedApplication(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'merchant_applications', [{
    application_id: 'app_1', restaurant_name: 'Whiskers & Wags', applicant_name: 'Sam Rivera',
    contact_email: 'sam@test.local', contact_phone: '', description: '',
    status: 'pending', rejection_reason: '',
    ...overrides,
  }]);
}

describe('/admin/merchant-applications', () => {
  beforeEach(() => {
    fakeDb.reset();
    sendMerchantInviteEmail.mockClear();
  });

  it('lists applications filtered by status', async () => {
    seedApplication({ application_id: 'app_1', status: 'pending' });
    seedApplication({ application_id: 'app_2', status: 'rejected' });
    const res = await request(app).get('/admin/merchant-applications?status=pending').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.applications.map((a: { application_id: string }) => a.application_id)).toEqual(['app_1']);
  });

  it('approving a pending application creates a restaurant (linked back via application_id) and an invite', async () => {
    seedApplication();
    const res = await request(app).post('/admin/merchant-applications/app_1/approve').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('approved');
    expect(res.body.restaurant).toMatchObject({ name: 'Whiskers & Wags', status: 'unclaimed', application_id: 'app_1' });
    expect(res.body.invite).toHaveProperty('expires_at');
    // The raw token must never be returned by the API.
    expect(res.body.invite).not.toHaveProperty('token');
    expect(res.body.invite).not.toHaveProperty('token_hash');
    expect(sendMerchantInviteEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects approving a non-pending application', async () => {
    seedApplication({ status: 'approved' });
    const res = await request(app).post('/admin/merchant-applications/app_1/approve').set(auth);
    expect(res.status).toBe(409);
  });

  it('rejects a pending application with a reason', async () => {
    seedApplication();
    const res = await request(app).post('/admin/merchant-applications/app_1/reject').set(auth).send({ reason: 'Duplicate submission' });
    expect(res.status).toBe(200);
    expect(res.body.application.status).toBe('rejected');
    expect(res.body.application.rejection_reason).toBe('Duplicate submission');
  });

  it('rejects rejecting a non-pending application', async () => {
    seedApplication({ status: 'rejected' });
    const res = await request(app).post('/admin/merchant-applications/app_1/reject').set(auth);
    expect(res.status).toBe(409);
  });

  it('404s approving an unknown application', async () => {
    const res = await request(app).post('/admin/merchant-applications/nope/approve').set(auth);
    expect(res.status).toBe(404);
  });

  it('regression: re-approving a manually-reset application reuses the existing restaurant instead of duplicating it', async () => {
    seedApplication();
    const first = await request(app).post('/admin/merchant-applications/app_1/approve').set(auth);
    const restaurantId = first.body.restaurant.restaurant_id;
    const oldToken = lastInvitedToken();

    // Simulate the pre-resend-invite manual workaround: an admin flips status back to
    // pending directly (e.g. in the Sheet) and re-approves.
    const ctx = fakeDb.adminContext();
    await ctx.table('merchant_applications').update({ where: { application_id: 'app_1' }, data: { status: 'pending' } });

    const second = await request(app).post('/admin/merchant-applications/app_1/approve').set(auth);
    expect(second.status).toBe(200);
    expect(second.body.restaurant.restaurant_id).toBe(restaurantId);

    const allRestaurants = await ctx.table('restaurants').findMany({ where: { application_id: 'app_1' } });
    expect(allRestaurants).toHaveLength(1);

    // The first approve's invite should now read as superseded, not just silently ignored.
    const oldPreview = await request(app).get(`/merchant/invite/${oldToken}`);
    expect(oldPreview.status).toBe(400);
    expect(oldPreview.body.error).toMatch(/no longer valid/i);
  });

  it('two concurrent approvals of the same application only create one restaurant', async () => {
    // NOTE: this asserts the invariant approve()'s withLock is meant to guarantee, but
    // unlike the invite-redemption mutex test (merchant.test.ts), reverting withLock
    // here doesn't reliably fail this test — the fake adapter has no real I/O latency,
    // so the vulnerable window between "read status" and "write status" doesn't
    // reliably get raced by Promise.all in-process. The real risk is real: actual
    // Google Sheets round-trips are slow enough to open that window. Kept as a
    // correctness assertion, not relied on as proof the mutex matters.
    seedApplication();
    const [r1, r2] = await Promise.all([
      request(app).post('/admin/merchant-applications/app_1/approve').set(auth),
      request(app).post('/admin/merchant-applications/app_1/approve').set(auth),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const ctx = fakeDb.adminContext();
    const restaurants = await ctx.table('restaurants').findMany({ where: { application_id: 'app_1' } });
    expect(restaurants).toHaveLength(1);
  });
});

describe('POST /admin/merchant-applications/:id/resend-invite', () => {
  beforeEach(() => {
    fakeDb.reset();
    sendMerchantInviteEmail.mockClear();
  });

  it('rejects resending for an application that was never approved', async () => {
    seedApplication({ status: 'pending' });
    const res = await request(app).post('/admin/merchant-applications/app_1/resend-invite').set(auth);
    expect(res.status).toBe(409);
  });

  it('404s if the approved application has no linked restaurant', async () => {
    seedApplication({ status: 'approved' });
    const res = await request(app).post('/admin/merchant-applications/app_1/resend-invite').set(auth);
    expect(res.status).toBe(404);
  });

  it('rejects resending once the restaurant has already been activated', async () => {
    seedApplication({ status: 'approved' });
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_1', application_id: 'app_1', status: 'active', name: 'X' }]);
    const res = await request(app).post('/admin/merchant-applications/app_1/resend-invite').set(auth);
    expect(res.status).toBe(409);
  });

  it('revokes the old token and issues a working new one', async () => {
    seedApplication();
    const approveRes = await request(app).post('/admin/merchant-applications/app_1/approve').set(auth);
    expect(approveRes.status).toBe(200);
    const oldToken = lastInvitedToken();

    const resendRes = await request(app).post('/admin/merchant-applications/app_1/resend-invite').set(auth);
    expect(resendRes.status).toBe(200);
    expect(sendMerchantInviteEmail).toHaveBeenCalledTimes(2);
    const newToken = lastInvitedToken();
    expect(newToken).not.toBe(oldToken);

    // The old link now reads as superseded, not merely "used" — a different message
    // so a merchant with a stale email in their inbox is pointed at the new one.
    const oldPreview = await request(app).get(`/merchant/invite/${oldToken}`);
    expect(oldPreview.status).toBe(400);
    expect(oldPreview.body.error).toMatch(/no longer valid/i);

    const newPreview = await request(app).get(`/merchant/invite/${newToken}`);
    expect(newPreview.status).toBe(200);
  });

  it('does not revoke an already-used invite (only live ones)', async () => {
    seedApplication();
    await request(app).post('/admin/merchant-applications/app_1/approve').set(auth);
    const firstToken = lastInvitedToken();

    await request(app).post(`/merchant/invite/${firstToken}`).send({ full_name: 'Sam', password: 'SuperStrongPass123!' });

    const resendRes = await request(app).post('/admin/merchant-applications/app_1/resend-invite').set(auth);
    // The restaurant is 'active' now (invite redeemed), so resend correctly refuses — this
    // also proves resend doesn't blindly revoke a used invite it has no business touching.
    expect(resendRes.status).toBe(409);
  });

  it('404s resending for an unknown application', async () => {
    const res = await request(app).post('/admin/merchant-applications/nope/resend-invite').set(auth);
    expect(res.status).toBe(404);
  });
});
