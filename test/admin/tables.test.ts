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

function seedRoom(roomId: string, restaurantId: string, locationId = 'loc_1') {
  fakeDb.seed('admin', 'rooms', [{ room_id: roomId, restaurant_id: restaurantId, location_id: locationId, floor_id: 'f1', name: 'Main Hall', active: true, sort_order: 0 }]);
}

describe('/admin/tables', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects create with no restaurant_id', async () => {
    const res = await request(app).post('/admin/tables').set(auth).send({ room_id: 'r1', label: 'T1', seats: 4 });
    expect(res.status).toBe(400);
  });

  it('404s create against an unknown restaurant', async () => {
    const res = await request(app).post('/admin/tables').set(auth).send({ restaurant_id: 'ghost', room_id: 'r1', label: 'T1', seats: 4 });
    expect(res.status).toBe(404);
  });

  it('404s create against a room that belongs to another restaurant', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    seedRoom('r1', 'restaurant_2');

    const res = await request(app).post('/admin/tables').set(auth)
      .send({ restaurant_id: 'restaurant_1', room_id: 'r1', label: 'T1', seats: 4 });
    expect(res.status).toBe(404);
  });

  it('rejects seats < 1', async () => {
    seedRestaurant('restaurant_1');
    seedRoom('r1', 'restaurant_1');
    const res = await request(app).post('/admin/tables').set(auth)
      .send({ restaurant_id: 'restaurant_1', room_id: 'r1', label: 'T1', seats: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid shape', async () => {
    seedRestaurant('restaurant_1');
    seedRoom('r1', 'restaurant_1');
    const res = await request(app).post('/admin/tables').set(auth)
      .send({ restaurant_id: 'restaurant_1', room_id: 'r1', label: 'T1', seats: 4, shape: 'hexagon' });
    expect(res.status).toBe(400);
  });

  it('creates a table, denormalizing restaurant_id/location_id from the room', async () => {
    seedRestaurant('restaurant_1');
    seedRoom('r1', 'restaurant_1', 'loc_1');

    const res = await request(app).post('/admin/tables').set(auth)
      .send({ restaurant_id: 'restaurant_1', room_id: 'r1', label: 'T1', seats: 4 });
    expect(res.status).toBe(201);
    expect(res.body.table).toMatchObject({ restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r1', label: 'T1', seats: 4, shape: 'square' });
  });

  it('rejects a duplicate label within the same room', async () => {
    seedRestaurant('restaurant_1');
    seedRoom('r1', 'restaurant_1');
    fakeDb.seed('admin', 'tables', [{ table_id: 't1', restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r1', label: 'T1', seats: 4, shape: 'square', active: true, sort_order: 0 }]);

    const res = await request(app).post('/admin/tables').set(auth)
      .send({ restaurant_id: 'restaurant_1', room_id: 'r1', label: 'T1', seats: 2 });
    expect(res.status).toBe(409);
  });

  it('allows the same label in a different room', async () => {
    seedRestaurant('restaurant_1');
    seedRoom('r1', 'restaurant_1');
    seedRoom('r2', 'restaurant_1');
    fakeDb.seed('admin', 'tables', [{ table_id: 't1', restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r1', label: 'T1', seats: 4, shape: 'square', active: true, sort_order: 0 }]);

    const res = await request(app).post('/admin/tables').set(auth)
      .send({ restaurant_id: 'restaurant_1', room_id: 'r2', label: 'T1', seats: 2 });
    expect(res.status).toBe(201);
  });

  it('filters list by room_id', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'tables', [
      { table_id: 't1', restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r1', label: 'T1', seats: 4, shape: 'square', active: true, sort_order: 0 },
      { table_id: 't2', restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r2', label: 'T2', seats: 2, shape: 'round', active: true, sort_order: 1 },
    ]);
    const res = await request(app).get('/admin/tables?room_id=r1').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.tables.map((t: { table_id: string }) => t.table_id)).toEqual(['t1']);
  });

  it('hard-deletes a table', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'tables', [{ table_id: 't1', restaurant_id: 'restaurant_1', location_id: 'loc_1', room_id: 'r1', label: 'T1', seats: 4, shape: 'square', active: true, sort_order: 0 }]);
    const del = await request(app).delete('/admin/tables/t1').set(auth);
    expect(del.status).toBe(204);
    const get = await request(app).get('/admin/tables/t1').set(auth);
    expect(get.status).toBe(404);
  });
});

describe('/merchant/tables (restaurant-scoped)', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects a non-merchant role', async () => {
    const res = await request(app).get('/merchant/tables').set(auth);
    expect(res.status).toBe(403);
  });

  it('lets a merchant manage tables on their own room', async () => {
    seedRestaurant('restaurant_1');
    seedRoom('r1', 'restaurant_1', 'loc_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const create = await request(app).post('/merchant/tables').set(merchAuth).send({ room_id: 'r1', label: 'T1', seats: 4 });
    expect(create.status).toBe(201);
    expect(create.body.table).toMatchObject({ restaurant_id: 'restaurant_1', location_id: 'loc_1' });

    const list = await request(app).get('/merchant/tables').set(merchAuth);
    expect(list.body.tables).toHaveLength(1);
  });

  it('404s when a merchant targets a room belonging to another restaurant', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    seedRoom('r2', 'restaurant_2');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).post('/merchant/tables').set(merchAuth).send({ room_id: 'r2', label: 'Sneaky', seats: 2 });
    expect(res.status).toBe(404);
  });
});
