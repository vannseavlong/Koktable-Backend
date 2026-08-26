import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

function seedPlan(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'plans', [{
    plan_id: 'plan_basic', tier: 'basic', name: 'Basic', price_monthly: 0, price_annual: 0,
    commission_rate_default: 0.1, max_locations: 1, features: ['Standard listing'],
    active: true, sort_order: 0,
    ...overrides,
  }]);
}

describe('/admin/plans', () => {
  beforeEach(() => fakeDb.reset());

  describe('GET /', () => {
    it('lists plans sorted by sort_order', async () => {
      seedPlan({ plan_id: 'plan_pro', tier: 'pro', sort_order: 1 });
      seedPlan({ plan_id: 'plan_basic', tier: 'basic', sort_order: 0 });

      const res = await request(app).get('/admin/plans').set(auth);

      expect(res.status).toBe(200);
      expect(res.body.plans.map((p: { tier: string }) => p.tier)).toEqual(['basic', 'pro']);
    });
  });

  describe('POST /', () => {
    it('creates a plan', async () => {
      const res = await request(app)
        .post('/admin/plans')
        .set(auth)
        .send({
          tier: 'pro',
          name: 'Pro',
          price_monthly: 49,
          price_annual: 490,
          max_locations: undefined,
          features: ['Unlimited locations', 'Full analytics'],
        });

      expect(res.status).toBe(201);
      expect(res.body.plan.tier).toBe('pro');
      expect(res.body.plan.plan_id).toMatch(/^plan_/);
    });

    it('rejects a duplicate tier', async () => {
      seedPlan();

      const res = await request(app)
        .post('/admin/plans')
        .set(auth)
        .send({ tier: 'basic', name: 'Basic 2', price_monthly: 0, price_annual: 0 });

      expect(res.status).toBe(409);
    });

    it('rejects a missing name', async () => {
      const res = await request(app)
        .post('/admin/plans')
        .set(auth)
        .send({ tier: 'pro', price_monthly: 49, price_annual: 490 });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /:id', () => {
    it('updates price and features', async () => {
      seedPlan();

      const res = await request(app)
        .patch('/admin/plans/plan_basic')
        .set(auth)
        .send({ price_monthly: 5, features: ['Standard listing', 'Basic analytics'] });

      expect(res.status).toBe(200);
      expect(res.body.plan.price_monthly).toBe(5);
      expect(res.body.plan.features).toEqual(['Standard listing', 'Basic analytics']);
    });

    it('404s for an unknown plan', async () => {
      const res = await request(app)
        .patch('/admin/plans/nope')
        .set(auth)
        .send({ price_monthly: 5 });

      expect(res.status).toBe(404);
    });
  });
});

describe('GET /user/plans (public)', () => {
  beforeEach(() => fakeDb.reset());

  it('only returns active plans', async () => {
    seedPlan({ plan_id: 'plan_basic', tier: 'basic', active: true });
    seedPlan({ plan_id: 'plan_pro', tier: 'pro', active: false });

    const res = await request(app).get('/user/plans');

    expect(res.status).toBe(200);
    expect(res.body.plans.map((p: { tier: string }) => p.tier)).toEqual(['basic']);
  });
});
