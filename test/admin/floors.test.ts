import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken, merchantToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

function seedRestaurant(restaurantId = 'restaurant_1') {
  fakeDb.seed('admin', 'restaurants', [{
    restaurant_id: restaurantId, owner_user_id: 'm_1', name: 'Test Restaurant', description: '', logo: '',
    contact_email: '', contact_phone: '', status: 'active',
  }]);
}

function seedLocation(locationId: string, restaurantId: string) {
  fakeDb.seed('admin', 'restaurant_locations', [{ location_id: locationId, restaurant_id: restaurantId, active: true }]);
}

describe('/admin/floors', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects create with no restaurant_id', async () => {
    const res = await request(app).post('/admin/floors').set(auth).send({ location_id: 'loc_1', name: 'Ground Floor' });
    expect(res.status).toBe(400);
  });

  it('404s create against an unknown restaurant', async () => {
    const res = await request(app).post('/admin/floors').set(auth).send({ restaurant_id: 'ghost', location_id: 'loc_1', name: 'Ground Floor' });
    expect(res.status).toBe(404);
  });

  it('404s create against a location that belongs to another restaurant', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    seedLocation('loc_1', 'restaurant_2');

    const res = await request(app).post('/admin/floors').set(auth)
      .send({ restaurant_id: 'restaurant_1', location_id: 'loc_1', name: 'Ground Floor' });
    expect(res.status).toBe(404);
  });

  it('creates a floor for an existing restaurant/location', async () => {
    seedRestaurant('restaurant_1');
    seedLocation('loc_1', 'restaurant_1');

    const res = await request(app).post('/admin/floors').set(auth)
      .send({ restaurant_id: 'restaurant_1', location_id: 'loc_1', name: 'Ground Floor' });
    expect(res.status).toBe(201);
    expect(res.body.floor).toMatchObject({ restaurant_id: 'restaurant_1', location_id: 'loc_1', name: 'Ground Floor', active: true });
  });

  it('filters list by restaurant_id and location_id', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    fakeDb.seed('admin', 'floors', [
      { floor_id: 'f1', restaurant_id: 'restaurant_1', location_id: 'loc_1', name: 'A', active: true, sort_order: 0 },
      { floor_id: 'f2', restaurant_id: 'restaurant_1', location_id: 'loc_2', name: 'B', active: true, sort_order: 1 },
      { floor_id: 'f3', restaurant_id: 'restaurant_2', location_id: 'loc_3', name: 'C', active: true, sort_order: 0 },
    ]);
    const res = await request(app).get('/admin/floors?restaurant_id=restaurant_1&location_id=loc_1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.floors.map((f: { floor_id: string }) => f.floor_id)).toEqual(['f1']);
  });

  it('refuses to delete a floor that still has rooms', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'floors', [{ floor_id: 'f1', restaurant_id: 'restaurant_1', location_id: 'loc_1', name: 'A', active: true, sort_order: 0 }]);
    fakeDb.seed('admin', 'rooms', [{ room_id: 'r1', restaurant_id: 'restaurant_1', location_id: 'loc_1', floor_id: 'f1', name: 'Main Hall', active: true, sort_order: 0 }]);

    const res = await request(app).delete('/admin/floors/f1').set(auth);
    expect(res.status).toBe(409);
  });

  it('deletes an empty floor', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'floors', [{ floor_id: 'f1', restaurant_id: 'restaurant_1', location_id: 'loc_1', name: 'A', active: true, sort_order: 0 }]);

    const del = await request(app).delete('/admin/floors/f1').set(auth);
    expect(del.status).toBe(204);
    const get = await request(app).get('/admin/floors/f1').set(auth);
    expect(get.status).toBe(404);
  });
});

describe('/merchant/floors (restaurant-scoped)', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects a non-merchant role', async () => {
    const res = await request(app).get('/merchant/floors').set(auth);
    expect(res.status).toBe(403);
  });

  it('lets a merchant manage floors on their own restaurant/location', async () => {
    seedRestaurant('restaurant_1');
    seedLocation('loc_1', 'restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const create = await request(app).post('/merchant/floors').set(merchAuth).send({ location_id: 'loc_1', name: 'Rooftop' });
    expect(create.status).toBe(201);
    expect(create.body.floor.restaurant_id).toBe('restaurant_1');

    const list = await request(app).get('/merchant/floors').set(merchAuth);
    expect(list.body.floors).toHaveLength(1);
  });

  it('404s when a merchant targets a location belonging to another restaurant', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    seedLocation('loc_2', 'restaurant_2');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).post('/merchant/floors').set(merchAuth).send({ location_id: 'loc_2', name: 'Sneaky' });
    expect(res.status).toBe(404);
  });

  it('404s when a merchant reaches for another restaurant\'s floor', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    fakeDb.seed('admin', 'floors', [{ floor_id: 'f1', restaurant_id: 'restaurant_2', location_id: 'loc_2', name: 'A', active: true, sort_order: 0 }]);

    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };
    const res = await request(app).get('/merchant/floors/f1').set(merchAuth);
    expect(res.status).toBe(404);
  });
});
