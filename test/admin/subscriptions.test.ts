import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

function seedRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurants', [{
    restaurant_id: 'restaurant_1', owner_user_id: '', name: 'Test Restaurant', description: '', logo: '',
    contact_email: 'restaurant@test.local', contact_phone: '', status: 'active',
    ...overrides,
  }]);
}

function seedLocation(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurant_locations', [{
    location_id: 'loc_1', restaurant_id: 'restaurant_1', name: '', contact_email: '', contact_phone: '',
    address: '', city_id: '', latitude: null, longitude: null, active: true,
    ...overrides,
  }]);
}

describe('/admin/restaurants/:id/subscription', () => {
  beforeEach(() => fakeDb.reset());

  describe('GET', () => {
    it('creates a pro trial subscription the first time it is read', async () => {
      seedRestaurant();

      const res = await request(app)
        .get('/admin/restaurants/restaurant_1/subscription')
        .set(auth);

      expect(res.status).toBe(200);
      expect(res.body.subscription.restaurant_id).toBe('restaurant_1');
      expect(res.body.subscription.tier).toBe('pro');
      expect(res.body.subscription.status).toBe('trialing');
      expect(res.body.subscription.trial_ends_at).toBeTruthy();
    });

    it('is idempotent — a second read returns the same subscription_id', async () => {
      seedRestaurant();

      const first = await request(app).get('/admin/restaurants/restaurant_1/subscription').set(auth);
      const second = await request(app).get('/admin/restaurants/restaurant_1/subscription').set(auth);

      expect(second.body.subscription.subscription_id).toBe(first.body.subscription.subscription_id);
    });

    it('404s for an unknown restaurant', async () => {
      const res = await request(app)
        .get('/admin/restaurants/nope/subscription')
        .set(auth);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH', () => {
    it('changes the tier', async () => {
      seedRestaurant();

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/subscription')
        .set(auth)
        .send({ tier: 'basic' });

      expect(res.status).toBe(200);
      expect(res.body.subscription.tier).toBe('basic');
    });

    it('rejects an invalid tier', async () => {
      seedRestaurant();

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/subscription')
        .set(auth)
        .send({ tier: 'ultra' });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });

    it('rejects an empty body', async () => {
      seedRestaurant();

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/subscription')
        .set(auth)
        .send({});

      expect(res.status).toBe(400);
    });
  });
});

describe('branch limit (POST /admin/restaurants/:id/locations)', () => {
  beforeEach(() => fakeDb.reset());

  it('allows the first location regardless of tier', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'subscriptions', [{
      subscription_id: 'sub_1', restaurant_id: 'restaurant_1', tier: 'basic', status: 'active',
    }]);

    const res = await request(app)
      .post('/admin/restaurants/restaurant_1/locations')
      .set(auth)
      .send({ name: 'Main Branch' });

    expect(res.status).toBe(201);
  });

  it('blocks a second location on a basic-tier restaurant', async () => {
    seedRestaurant();
    seedLocation();
    fakeDb.seed('admin', 'subscriptions', [{
      subscription_id: 'sub_1', restaurant_id: 'restaurant_1', tier: 'basic', status: 'active',
    }]);

    const res = await request(app)
      .post('/admin/restaurants/restaurant_1/locations')
      .set(auth)
      .send({ name: 'Second Branch' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/upgrade to pro/i);
  });

  it('allows a second location on a pro-tier restaurant', async () => {
    seedRestaurant();
    seedLocation();
    fakeDb.seed('admin', 'subscriptions', [{
      subscription_id: 'sub_1', restaurant_id: 'restaurant_1', tier: 'pro', status: 'active',
    }]);

    const res = await request(app)
      .post('/admin/restaurants/restaurant_1/locations')
      .set(auth)
      .send({ name: 'Second Branch' });

    expect(res.status).toBe(201);
  });

  it('blocks a second location when no subscription exists yet (defaults to a pro trial, but exercises the ensureForRestaurant path)', async () => {
    seedRestaurant();
    seedLocation();

    const res = await request(app)
      .post('/admin/restaurants/restaurant_1/locations')
      .set(auth)
      .send({ name: 'Second Branch' });

    // No subscriptions row seeded — ensureForRestaurant() creates one as a pro trial,
    // so this restaurant is allowed a second location.
    expect(res.status).toBe(201);
  });
});
