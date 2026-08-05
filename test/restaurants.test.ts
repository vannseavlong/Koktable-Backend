import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/adapter', async () => await import('../src/testUtils/fakeAdapter'));

import { buildTestApp } from './helpers/testApp';
import * as fakeDb from '../src/testUtils/fakeAdapter';

const app = buildTestApp();

function seedRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurants', [{
    restaurant_id: 'restaurant_1', application_id: 'app_1', owner_user_id: 'm_1', name: 'Test Restaurant',
    description: 'A restaurant', logo: '', contact_email: 'restaurant@test.local', contact_phone: '',
    hours: '', status: 'active',
    ...overrides,
  }]);
}

describe('GET /user/restaurants', () => {
  beforeEach(() => fakeDb.reset());

  it('lists only active restaurants', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', status: 'active' });
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_2', name: 'Pending Restaurant', status: 'pending' }]);
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_3', name: 'Suspended Restaurant', status: 'suspended' }]);

    const res = await request(app).get('/user/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(1);
    expect(res.body.restaurants[0].restaurant_id).toBe('restaurant_1');
  });

  it('strips application_id and owner_user_id from the public response', async () => {
    seedRestaurant();
    const res = await request(app).get('/user/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.restaurants[0]).not.toHaveProperty('application_id');
    expect(res.body.restaurants[0]).not.toHaveProperty('owner_user_id');
    expect(res.body.restaurants[0]).toMatchObject({ restaurant_id: 'restaurant_1', name: 'Test Restaurant' });
  });

  it('returns an empty list when no restaurants are active', async () => {
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_2', name: 'Pending Restaurant', status: 'pending' }]);
    const res = await request(app).get('/user/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.restaurants).toEqual([]);
  });
});

describe('GET /user/restaurants/:id', () => {
  beforeEach(() => fakeDb.reset());

  it('returns an active restaurant, stripped of internal fields', async () => {
    seedRestaurant();
    const res = await request(app).get('/user/restaurants/restaurant_1');
    expect(res.status).toBe(200);
    expect(res.body.restaurant).toMatchObject({ restaurant_id: 'restaurant_1', name: 'Test Restaurant' });
    expect(res.body.restaurant).not.toHaveProperty('application_id');
    expect(res.body.restaurant).not.toHaveProperty('owner_user_id');
  });

  it('404s for an unknown restaurant', async () => {
    const res = await request(app).get('/user/restaurants/nope');
    expect(res.status).toBe(404);
  });

  it('404s for a pending restaurant (does not leak status)', async () => {
    seedRestaurant({ status: 'pending' });
    const res = await request(app).get('/user/restaurants/restaurant_1');
    expect(res.status).toBe(404);
  });

  it('404s for a suspended restaurant', async () => {
    seedRestaurant({ status: 'suspended' });
    const res = await request(app).get('/user/restaurants/restaurant_1');
    expect(res.status).toBe(404);
  });
});

describe('GET /user/restaurants/:id/catalog-items', () => {
  beforeEach(() => fakeDb.reset());

  it('lists only active catalog items for the restaurant, sorted by sort_order', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'i2', restaurant_id: 'restaurant_1', item_type: 'service', name: 'B', price_from: 5,  active: true, sort_order: 1 },
      { item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'service', name: 'A', price_from: 10, active: true, sort_order: 0 },
      { item_id: 'i3', restaurant_id: 'restaurant_1', item_type: 'service', name: 'C', price_from: 8,  active: false, sort_order: 2 },
      { item_id: 'i4', restaurant_id: 'restaurant_2', item_type: 'service', name: 'D', price_from: 8,  active: true, sort_order: 0 },
    ]);

    const res = await request(app).get('/user/restaurants/restaurant_1/catalog-items');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { item_id: string }) => i.item_id)).toEqual(['i1', 'i2']);
  });

  it('404s for an unknown restaurant', async () => {
    const res = await request(app).get('/user/restaurants/nope/catalog-items');
    expect(res.status).toBe(404);
  });

  it('404s for a non-active restaurant', async () => {
    seedRestaurant({ status: 'suspended' });
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'service', name: 'A', price_from: 10, active: true, sort_order: 0 },
    ]);
    const res = await request(app).get('/user/restaurants/restaurant_1/catalog-items');
    expect(res.status).toBe(404);
  });

  it('includes the image field on returned items', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'service', name: 'A', price_from: 10, active: true, sort_order: 0, image: 'https://example.com/a.png' },
    ]);
    const res = await request(app).get('/user/restaurants/restaurant_1/catalog-items');
    expect(res.status).toBe(200);
    expect(res.body.items[0].image).toBe('https://example.com/a.png');
  });
});
