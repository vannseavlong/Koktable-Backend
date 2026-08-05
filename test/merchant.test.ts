import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/adapter', async () => await import('../src/testUtils/fakeAdapter'));

import { buildTestApp } from './helpers/testApp';
import * as fakeDb from '../src/testUtils/fakeAdapter';
import { generateInviteToken, INVITE_TOKEN_TTL_MS } from '../src/lib/inviteToken';

const app = buildTestApp();

function seedRestaurantAndInvite(raw_or_hash: { raw: string; hash: string }, overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurants', [{
    restaurant_id: 'restaurant_1', owner_user_id: '', name: 'Test Restaurant', description: '', logo: '',
    contact_email: 'restaurant@test.local', contact_phone: '', hours: '', status: 'pending',
  }]);
  fakeDb.seed('admin', 'merchant_invites', [{
    invite_id: 'inv_1', restaurant_id: 'restaurant_1', email: 'owner@test.local',
    token_hash: raw_or_hash.hash, expires_at: new Date(Date.now() + INVITE_TOKEN_TTL_MS).toISOString(), used_at: '',
    ...overrides,
  }]);
}

describe('POST /merchant/apply', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects a missing required field', async () => {
    const res = await request(app).post('/merchant/apply').send({ restaurant_name: 'X' });
    expect(res.status).toBe(400);
  });

  it('creates a pending application', async () => {
    const res = await request(app).post('/merchant/apply').send({
      restaurant_name: 'Whiskers', applicant_name: 'Sam', contact_email: 'sam@test.local',
    });
    expect(res.status).toBe(201);
    expect(res.body.application.status).toBe('pending');
  });

  it('rejects a duplicate pending application for the same email', async () => {
    fakeDb.seed('admin', 'merchant_applications', [{
      application_id: 'app_1', restaurant_name: 'X', applicant_name: 'Y', contact_email: 'dup@test.local',
      contact_phone: '', description: '', status: 'pending', rejection_reason: '',
    }]);
    const res = await request(app).post('/merchant/apply').send({
      restaurant_name: 'Whiskers', applicant_name: 'Sam', contact_email: 'dup@test.local',
    });
    expect(res.status).toBe(409);
  });
});

describe('GET /merchant/invite/:token', () => {
  beforeEach(() => fakeDb.reset());

  it('404s an unknown token', async () => {
    const res = await request(app).get('/merchant/invite/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('400s an expired invite', async () => {
    const { raw, hash } = generateInviteToken();
    seedRestaurantAndInvite({ raw, hash }, { expires_at: new Date(Date.now() - 1000).toISOString() });
    const res = await request(app).get(`/merchant/invite/${raw}`);
    expect(res.status).toBe(400);
  });

  it('400s an already-used invite', async () => {
    const { raw, hash } = generateInviteToken();
    seedRestaurantAndInvite({ raw, hash }, { used_at: new Date().toISOString() });
    const res = await request(app).get(`/merchant/invite/${raw}`);
    expect(res.status).toBe(400);
  });

  it('previews a valid invite without exposing the token', async () => {
    const { raw, hash } = generateInviteToken();
    seedRestaurantAndInvite({ raw, hash });
    const res = await request(app).get(`/merchant/invite/${raw}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('owner@test.local');
    expect(res.body.restaurant.name).toBe('Test Restaurant');
  });
});

describe('POST /merchant/invite/:token (accept)', () => {
  beforeEach(() => fakeDb.reset());

  it('activates the restaurant and returns a merchant JWT', async () => {
    const { raw, hash } = generateInviteToken();
    seedRestaurantAndInvite({ raw, hash });

    const res = await request(app).post(`/merchant/invite/${raw}`).send({ full_name: 'Sam Owner', password: 'SuperStrongPass123!' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'owner@test.local', role: 'merchant' });
    expect(res.body.restaurant).toMatchObject({ restaurant_id: 'restaurant_1', status: 'active', owner_user_id: res.body.user.user_id });
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects a weak password', async () => {
    const { raw, hash } = generateInviteToken();
    seedRestaurantAndInvite({ raw, hash });
    const res = await request(app).post(`/merchant/invite/${raw}`).send({ full_name: 'Sam Owner', password: '123' });
    expect(res.status).toBe(422);
  });

  it('regression: two concurrent redemptions of the same token only let one through', async () => {
    const { raw, hash } = generateInviteToken();
    seedRestaurantAndInvite({ raw, hash });

    const body = { full_name: 'Sam Owner', password: 'SuperStrongPass123!' };
    const [r1, r2] = await Promise.all([
      request(app).post(`/merchant/invite/${raw}`).send(body),
      request(app).post(`/merchant/invite/${raw}`).send(body),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 400]);
  });
});
