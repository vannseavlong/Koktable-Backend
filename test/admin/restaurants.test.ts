import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    contact_email: 'restaurant@test.local', contact_phone: '', hours: '', status: 'pending',
    ...overrides,
  }]);
}

describe('/admin/restaurants', () => {
  beforeEach(() => fakeDb.reset());

  it('lists restaurants filtered by status', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', status: 'pending' });
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_2', name: 'Other', status: 'active', owner_user_id: 'm_1' }]);

    const res = await request(app).get('/admin/restaurants?status=active').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(1);
    expect(res.body.restaurants[0].restaurant_id).toBe('restaurant_2');
  });

  it('404s getById for an unknown restaurant', async () => {
    const res = await request(app).get('/admin/restaurants/nope').set(auth);
    expect(res.status).toBe(404);
  });

  it('rejects an invalid status value', async () => {
    seedRestaurant();
    const res = await request(app).patch('/admin/restaurants/restaurant_1').set(auth).send({ status: 'deleted' });
    expect(res.status).toBe(400);
  });

  it('suspends and reactivates a restaurant', async () => {
    seedRestaurant({ status: 'active' });

    const suspend = await request(app).patch('/admin/restaurants/restaurant_1').set(auth).send({ status: 'suspended' });
    expect(suspend.status).toBe(200);
    expect(suspend.body.restaurant.status).toBe('suspended');

    const reactivate = await request(app).patch('/admin/restaurants/restaurant_1').set(auth).send({ status: 'active' });
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.restaurant.status).toBe('active');
  });

  it('404s updating an unknown restaurant', async () => {
    const res = await request(app).patch('/admin/restaurants/nope').set(auth).send({ status: 'active' });
    expect(res.status).toBe(404);
  });
});
