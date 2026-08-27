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

function seedFloor(floorId: string, restaurantId: string, locationId = 'loc_1') {
  fakeDb.seed('admin', 'floors', [{ floor_id: floorId, restaurant_id: restaurantId, location_id: locationId, name: 'Ground Floor', active: true, sort_order: 0 }]);
}

describe('/admin/rooms', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects create with no restaurant_id', async () => {
    const res = await request(app).post('/admin/rooms').set(auth).send({ floor_id: 'f1', name: 'Main Hall' });
    expect(res.status).toBe(400);
  });

  it('rejects create with no floor_id', async () => {
    seedRestaurant('restaurant_1');
    const res = await request(app).post('/admin/rooms').set(auth).send({ restaurant_id: 'restaurant_1', name: 'Main Hall' });
    expect(res.status).toBe(400);
  });

  it('404s create against an unknown restaurant', async () => {
    const res = await request(app).post('/admin/rooms').set(auth).send({ restaurant_id: 'ghost', floor_id: 'f1', name: 'Main Hall' });
    expect(res.status).toBe(404);
  });

  it('404s create against a floor that belongs to another restaurant', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    seedFloor('f1', 'restaurant_2');

    const res = await request(app).post('/admin/rooms').set(auth)
      .send({ restaurant_id: 'restaurant_1', floor_id: 'f1', name: 'Main Hall' });
    expect(res.status).toBe(404);
  });

  it('creates a room, denormalizing restaurant_id/location_id from the floor', async () => {
    seedRestaurant('restaurant_1');
    seedFloor('f1', 'restaurant_1', 'loc_1');

    const res = await request(app).post('/admin/rooms').set(auth)
      .send({ restaurant_id: 'restaurant_1', floor_id: 'f1', name: 'Main Hall' });
    expect(res.status).toBe(201);
    expect(res.body.room).toMatchObject({ restaurant_id: 'restaurant_1', location_id: 'loc_1', floor_id: 'f1', name: 'Main Hall' });
  });

  it('computes total_seats from the room\'s tables', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'rooms', [{ room_id: 'r1', restaurant_id: 'restaurant_1', location_id: 'loc_1', floor_id: 'f1', name: 'Main Hall', active: true, sort_order: 0 }]);
    fakeDb.seed('admin', 'tables', [
      { table_id: 't1', restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r1', label: 'T1', seats: 4, shape: 'square', active: true, sort_order: 0 },
      { table_id: 't2', restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r1', label: 'T2', seats: 2, shape: 'round', active: true, sort_order: 1 },
    ]);

    const res = await request(app).get('/admin/rooms/r1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.room.total_seats).toBe(6);
  });

  it('refuses to delete a room that still has tables', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'rooms', [{ room_id: 'r1', restaurant_id: 'restaurant_1', location_id: 'loc_1', floor_id: 'f1', name: 'Main Hall', active: true, sort_order: 0 }]);
    fakeDb.seed('admin', 'tables', [{ table_id: 't1', restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r1', label: 'T1', seats: 4, shape: 'square', active: true, sort_order: 0 }]);

    const res = await request(app).delete('/admin/rooms/r1').set(auth);
    expect(res.status).toBe(409);
  });
});

describe('/merchant/rooms (restaurant-scoped)', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects a non-merchant role', async () => {
    const res = await request(app).get('/merchant/rooms').set(auth);
    expect(res.status).toBe(403);
  });

  it('lets a merchant manage rooms on their own floor', async () => {
    seedRestaurant('restaurant_1');
    seedFloor('f1', 'restaurant_1', 'loc_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const create = await request(app).post('/merchant/rooms').set(merchAuth).send({ floor_id: 'f1', name: 'Patio' });
    expect(create.status).toBe(201);
    expect(create.body.room).toMatchObject({ restaurant_id: 'restaurant_1', location_id: 'loc_1' });

    const list = await request(app).get('/merchant/rooms').set(merchAuth);
    expect(list.body.rooms).toHaveLength(1);
  });

  it('404s when a merchant targets a floor belonging to another restaurant', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    seedFloor('f2', 'restaurant_2');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).post('/merchant/rooms').set(merchAuth).send({ floor_id: 'f2', name: 'Sneaky' });
    expect(res.status).toBe(404);
  });
});
