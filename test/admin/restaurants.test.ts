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
    contact_email: 'restaurant@test.local', contact_phone: '', status: 'pending',
    ...overrides,
  }]);
}

function seedLocation(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurant_locations', [{
    location_id: 'loc_restaurant_1', restaurant_id: 'restaurant_1',
    contact_email: '', contact_phone: '',
    ...overrides,
  }]);
}

function seedHours(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurant_hours', [{
    hours_id: 'hrs_loc_restaurant_1_monday', restaurant_id: 'restaurant_1', location_id: 'loc_restaurant_1',
    day_of_week: 'monday', closed: false, open_24h: false, periods: [{ open: '11:00', close: '21:00' }],
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

  it('embeds hours on each location, not on the restaurant itself', async () => {
    seedRestaurant();
    seedLocation();
    seedHours();
    seedHours({ hours_id: 'hrs_loc_restaurant_1_tuesday', day_of_week: 'tuesday', closed: true });

    const res = await request(app).get('/admin/restaurants/restaurant_1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.restaurant).not.toHaveProperty('hours');
    expect(res.body.restaurant.locations).toHaveLength(1);
    expect(res.body.restaurant.locations[0].location_id).toBe('loc_restaurant_1');
    expect(res.body.restaurant.locations[0].hours).toHaveLength(2);
    expect(res.body.restaurant.locations[0].hours[0]).toMatchObject({ day_of_week: 'monday', closed: false });
    expect(res.body.restaurant.locations[0].hours[1]).toMatchObject({ day_of_week: 'tuesday', closed: true });
  });

  it('embeds an empty hours array on a location with none configured', async () => {
    seedRestaurant();
    seedLocation();

    const res = await request(app).get('/admin/restaurants/restaurant_1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.restaurant.locations[0].hours).toEqual([]);
  });

  it('embeds per-location hours in the list endpoint too, in one batched read', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', status: 'active' });
    seedLocation();
    seedHours();
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_2', name: 'Other', status: 'active', owner_user_id: 'm_1' }]);
    fakeDb.seed('admin', 'restaurant_locations', [{ location_id: 'loc_restaurant_2', restaurant_id: 'restaurant_2', contact_email: '', contact_phone: '' }]);

    const res = await request(app).get('/admin/restaurants?status=active').set(auth);
    expect(res.status).toBe(200);
    const r1 = res.body.restaurants.find((r: { restaurant_id: string }) => r.restaurant_id === 'restaurant_1');
    const r2 = res.body.restaurants.find((r: { restaurant_id: string }) => r.restaurant_id === 'restaurant_2');
    expect(r1).not.toHaveProperty('hours');
    expect(r1.locations[0].hours).toHaveLength(1);
    expect(r2.locations[0].hours).toEqual([]);
  });
});
