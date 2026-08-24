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
    status: 'active',
    ...overrides,
  }]);
}

describe('GET /user/restaurants', () => {
  beforeEach(() => fakeDb.reset());

  it('lists only active and unclaimed restaurants', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', status: 'active' });
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_2', name: 'Pending Restaurant', status: 'pending' }]);
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_3', name: 'Suspended Restaurant', status: 'suspended' }]);
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_4', name: 'Unclaimed Restaurant', status: 'unclaimed' }]);

    const res = await request(app).get('/user/restaurants');
    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id).sort()).toEqual(['restaurant_1', 'restaurant_4']);
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

  it('filters by city_id, matching if any of the restaurant\'s locations is in that city', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', name: 'PP Spot' });
    seedRestaurant({ restaurant_id: 'restaurant_2', name: 'Siem Reap Spot' });
    fakeDb.seed('admin', 'restaurant_locations', [
      { location_id: 'loc_1', restaurant_id: 'restaurant_1', city_id: 'city_pp', district_id: 'dist_bkk1' },
      { location_id: 'loc_2', restaurant_id: 'restaurant_2', city_id: 'city_sr', district_id: 'dist_slakram' },
    ]);

    const res = await request(app).get('/user/restaurants').query({ city_id: 'city_pp' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_1']);
  });

  it('filters by city_id and district_id together', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', name: 'BKK1 Spot' });
    seedRestaurant({ restaurant_id: 'restaurant_2', name: 'Riverside Spot' });
    fakeDb.seed('admin', 'restaurant_locations', [
      { location_id: 'loc_1', restaurant_id: 'restaurant_1', city_id: 'city_pp', district_id: 'dist_bkk1' },
      { location_id: 'loc_2', restaurant_id: 'restaurant_2', city_id: 'city_pp', district_id: 'dist_riverside' },
    ]);

    const res = await request(app).get('/user/restaurants').query({ city_id: 'city_pp', district_id: 'dist_riverside' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_2']);
  });

  it('ignores an unset/empty city_id or district_id filter', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1' });
    fakeDb.seed('admin', 'restaurant_locations', [
      { location_id: 'loc_1', restaurant_id: 'restaurant_1', city_id: 'city_pp', district_id: 'dist_bkk1' },
    ]);

    const res = await request(app).get('/user/restaurants').query({ city_id: '' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(1);
  });

  it('filters by cuisine_id, matching restaurants with that cuisine attached', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', name: 'Khmer Spot' });
    seedRestaurant({ restaurant_id: 'restaurant_2', name: 'Thai Spot' });
    fakeDb.seed('admin', 'cuisines', [
      { cuisine_id: 'cui_khmer', name: 'Khmer', active: true, sort_order: 0 },
      { cuisine_id: 'cui_thai',  name: 'Thai',  active: true, sort_order: 1 },
    ]);
    fakeDb.seed('admin', 'restaurant_cuisines', [
      { restaurant_cuisine_id: 'rc_1', restaurant_id: 'restaurant_1', cuisine_id: 'cui_khmer' },
      { restaurant_cuisine_id: 'rc_2', restaurant_id: 'restaurant_2', cuisine_id: 'cui_thai' },
    ]);

    const res = await request(app).get('/user/restaurants').query({ cuisine_id: 'cui_khmer' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_1']);
    expect(res.body.restaurants[0].cuisines).toEqual(['Khmer']);
  });

  it('combines cuisine_id with city_id/district_id filters', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', name: 'PP Khmer Spot' });
    seedRestaurant({ restaurant_id: 'restaurant_2', name: 'SR Khmer Spot' });
    fakeDb.seed('admin', 'cuisines', [
      { cuisine_id: 'cui_khmer', name: 'Khmer', active: true, sort_order: 0 },
    ]);
    fakeDb.seed('admin', 'restaurant_locations', [
      { location_id: 'loc_1', restaurant_id: 'restaurant_1', city_id: 'city_pp', district_id: 'dist_bkk1' },
      { location_id: 'loc_2', restaurant_id: 'restaurant_2', city_id: 'city_sr', district_id: 'dist_slakram' },
    ]);
    fakeDb.seed('admin', 'restaurant_cuisines', [
      { restaurant_cuisine_id: 'rc_1', restaurant_id: 'restaurant_1', cuisine_id: 'cui_khmer' },
      { restaurant_cuisine_id: 'rc_2', restaurant_id: 'restaurant_2', cuisine_id: 'cui_khmer' },
    ]);

    const res = await request(app).get('/user/restaurants').query({ cuisine_id: 'cui_khmer', city_id: 'city_pp' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_1']);
  });

  it('ignores an unset/empty cuisine_id filter', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1' });
    const res = await request(app).get('/user/restaurants').query({ cuisine_id: '' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(1);
  });

  it('returns an empty list for a cuisine_id no restaurant has', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1' });
    const res = await request(app).get('/user/restaurants').query({ cuisine_id: 'cui_nonexistent' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants).toEqual([]);
  });

  it('filters by q, case-insensitive substring match against name', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', name: 'Khmer Kitchen' });
    seedRestaurant({ restaurant_id: 'restaurant_2', name: 'Pizza Place' });

    const res = await request(app).get('/user/restaurants').query({ q: 'khmer' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_1']);
  });

  it('matches q against name_zh/name_km/name_ko as well as name', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', name: 'Test Restaurant', name_km: 'ភោជនីយដ្ឋានខ្មែរ' });
    seedRestaurant({ restaurant_id: 'restaurant_2', name: 'Other Restaurant' });

    const res = await request(app).get('/user/restaurants').query({ q: 'ខ្មែរ' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_1']);
  });

  it('combines q with city_id/cuisine_id filters', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', name: 'Khmer Kitchen' });
    seedRestaurant({ restaurant_id: 'restaurant_2', name: 'Khmer Corner' });
    fakeDb.seed('admin', 'restaurant_locations', [
      { location_id: 'loc_1', restaurant_id: 'restaurant_1', city_id: 'city_pp', district_id: 'dist_bkk1' },
      { location_id: 'loc_2', restaurant_id: 'restaurant_2', city_id: 'city_sr', district_id: 'dist_slakram' },
    ]);

    const res = await request(app).get('/user/restaurants').query({ q: 'khmer', city_id: 'city_pp' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_1']);
  });

  it('ignores an unset/empty q filter', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1' });
    const res = await request(app).get('/user/restaurants').query({ q: '' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants).toHaveLength(1);
  });

  it('returns an empty list for a q no restaurant matches', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', name: 'Khmer Kitchen' });
    const res = await request(app).get('/user/restaurants').query({ q: 'nonexistent' });
    expect(res.status).toBe(200);
    expect(res.body.restaurants).toEqual([]);
  });

  describe('pagination', () => {
    function seedManyRestaurants(count: number) {
      for (let i = 1; i <= count; i++) {
        seedRestaurant({ restaurant_id: `restaurant_${i}`, name: `Restaurant ${i}` });
      }
    }

    it('returns everything, unpaginated, when limit is omitted (no regression)', async () => {
      seedManyRestaurants(5);
      const res = await request(app).get('/user/restaurants');
      expect(res.status).toBe(200);
      expect(res.body.restaurants).toHaveLength(5);
      expect(res.body.total).toBe(5);
      expect(res.body).not.toHaveProperty('limit');
      expect(res.body).not.toHaveProperty('offset');
    });

    it('paginates with limit and offset', async () => {
      seedManyRestaurants(5);
      const res = await request(app).get('/user/restaurants').query({ limit: 2, offset: 2 });
      expect(res.status).toBe(200);
      expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_3', 'restaurant_4']);
      expect(res.body.total).toBe(5);
      expect(res.body.limit).toBe(2);
      expect(res.body.offset).toBe(2);
    });

    it('reflects the filtered count in total, not the page size', async () => {
      seedManyRestaurants(3);
      fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_pending', name: 'Pending', status: 'pending' }]);
      const res = await request(app).get('/user/restaurants').query({ limit: 1 });
      expect(res.status).toBe(200);
      expect(res.body.restaurants).toHaveLength(1);
      expect(res.body.total).toBe(3);
    });

    it('caps limit at 100', async () => {
      seedManyRestaurants(2);
      const res = await request(app).get('/user/restaurants').query({ limit: 500 });
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
      expect(res.body.restaurants).toHaveLength(2);
    });

    it('combines city_id/district_id/cuisine_id filters with pagination', async () => {
      seedRestaurant({ restaurant_id: 'restaurant_1', name: 'PP Khmer 1' });
      seedRestaurant({ restaurant_id: 'restaurant_2', name: 'PP Khmer 2' });
      seedRestaurant({ restaurant_id: 'restaurant_3', name: 'SR Khmer' });
      fakeDb.seed('admin', 'cuisines', [{ cuisine_id: 'cui_khmer', name: 'Khmer', active: true, sort_order: 0 }]);
      fakeDb.seed('admin', 'restaurant_locations', [
        { location_id: 'loc_1', restaurant_id: 'restaurant_1', city_id: 'city_pp', district_id: 'dist_bkk1' },
        { location_id: 'loc_2', restaurant_id: 'restaurant_2', city_id: 'city_pp', district_id: 'dist_bkk1' },
        { location_id: 'loc_3', restaurant_id: 'restaurant_3', city_id: 'city_sr', district_id: 'dist_slakram' },
      ]);
      fakeDb.seed('admin', 'restaurant_cuisines', [
        { restaurant_cuisine_id: 'rc_1', restaurant_id: 'restaurant_1', cuisine_id: 'cui_khmer' },
        { restaurant_cuisine_id: 'rc_2', restaurant_id: 'restaurant_2', cuisine_id: 'cui_khmer' },
        { restaurant_cuisine_id: 'rc_3', restaurant_id: 'restaurant_3', cuisine_id: 'cui_khmer' },
      ]);

      const res = await request(app).get('/user/restaurants').query({ cuisine_id: 'cui_khmer', city_id: 'city_pp', limit: 1, offset: 1 });
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(2);
      expect(res.body.restaurants.map((r: { restaurant_id: string }) => r.restaurant_id)).toEqual(['restaurant_2']);
    });

    it.each([
      ['limit', 0],
      ['limit', -1],
      ['limit', 1.5],
    ])('400s for an invalid %s of %s', async (param, value) => {
      seedRestaurant();
      const res = await request(app).get('/user/restaurants').query({ [param]: value });
      expect(res.status).toBe(400);
    });

    it.each([
      ['offset', -1],
      ['offset', 1.5],
    ])('400s for an invalid %s of %s', async (param, value) => {
      seedRestaurant();
      const res = await request(app).get('/user/restaurants').query({ [param]: value });
      expect(res.status).toBe(400);
    });
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

  it('returns an unclaimed restaurant — bookable before any owner registers', async () => {
    seedRestaurant({ status: 'unclaimed', owner_user_id: '' });
    const res = await request(app).get('/user/restaurants/restaurant_1');
    expect(res.status).toBe(200);
    expect(res.body.restaurant).toMatchObject({ restaurant_id: 'restaurant_1', status: 'unclaimed' });
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
