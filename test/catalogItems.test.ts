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

describe('GET /user/catalog-items', () => {
  beforeEach(() => fakeDb.reset());

  it('only returns active items from active restaurants', async () => {
    seedRestaurant({ restaurant_id: 'restaurant_1', status: 'active' });
    seedRestaurant({ restaurant_id: 'restaurant_2', status: 'pending' });
    seedRestaurant({ restaurant_id: 'restaurant_3', status: 'suspended' });
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'product', name: 'Visible active item',      price_from: 10, active: true,  sort_order: 0 },
      { item_id: 'i2', restaurant_id: 'restaurant_1', item_type: 'product', name: 'Inactive item',             price_from: 5,  active: false, sort_order: 1 },
      { item_id: 'i3', restaurant_id: 'restaurant_2', item_type: 'product', name: 'Item from pending restaurant',    price_from: 8,  active: true,  sort_order: 0 },
      { item_id: 'i4', restaurant_id: 'restaurant_3', item_type: 'product', name: 'Item from suspended restaurant',  price_from: 8,  active: true,  sort_order: 0 },
    ]);

    const res = await request(app).get('/user/catalog-items');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { item_id: string }) => i.item_id)).toEqual(['i1']);
  });

  it('filters by type when given', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'p1', restaurant_id: 'restaurant_1', item_type: 'product', name: 'Product', price_from: 10, active: true, sort_order: 0 },
      { item_id: 's1', restaurant_id: 'restaurant_1', item_type: 'service', name: 'Service', price_from: 20, active: true, sort_order: 1 },
    ]);

    const res = await request(app).get('/user/catalog-items?type=product');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { item_id: string }) => i.item_id)).toEqual(['p1']);
  });

  it('rejects an unknown type value', async () => {
    const res = await request(app).get('/user/catalog-items?type=bogus');
    expect(res.status).toBe(400);
  });

  it('returns both types when type is absent', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'p1', restaurant_id: 'restaurant_1', item_type: 'product', name: 'Product', price_from: 10, active: true, sort_order: 0 },
      { item_id: 's1', restaurant_id: 'restaurant_1', item_type: 'service', name: 'Service', price_from: 20, active: true, sort_order: 1 },
    ]);

    const res = await request(app).get('/user/catalog-items');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
  });

  it('caps results with limit, respecting sort_order', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'i2', restaurant_id: 'restaurant_1', item_type: 'product', name: 'B', price_from: 5,  active: true, sort_order: 1 },
      { item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'product', name: 'A', price_from: 10, active: true, sort_order: 0 },
      { item_id: 'i3', restaurant_id: 'restaurant_1', item_type: 'product', name: 'C', price_from: 8,  active: true, sort_order: 2 },
    ]);

    const res = await request(app).get('/user/catalog-items?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { item_id: string }) => i.item_id)).toEqual(['i1', 'i2']);
  });

  it('rejects a non-positive-integer limit', async () => {
    seedRestaurant();
    const zero = await request(app).get('/user/catalog-items?limit=0');
    expect(zero.status).toBe(400);

    const negative = await request(app).get('/user/catalog-items?limit=-1');
    expect(negative.status).toBe(400);

    const nonInteger = await request(app).get('/user/catalog-items?limit=abc');
    expect(nonInteger.status).toBe(400);
  });

  it('includes the image field on returned items', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'product', name: 'A', price_from: 10, active: true, sort_order: 0, image: 'https://example.com/a.png' },
    ]);

    const res = await request(app).get('/user/catalog-items');
    expect(res.status).toBe(200);
    expect(res.body.items[0].image).toBe('https://example.com/a.png');
  });

  it('returns an empty list when nothing matches', async () => {
    const res = await request(app).get('/user/catalog-items');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});
