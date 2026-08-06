import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/adapter', async () => await import('../src/testUtils/fakeAdapter'));

import { buildTestApp } from './helpers/testApp';
import { userToken } from './helpers/auth';
import * as fakeDb from '../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${userToken({ actor_sheet_id: 'sheet_1' })}` };

describe('POST /user/reservations', () => {
  beforeEach(() => fakeDb.reset());

  it('books against the legacy services table via service_id, restaurant_id stays blank', async () => {
    fakeDb.seed('admin', 'services', [{ service_id: 'svc_1', name: 'Chef Tasting Menu', price_from: 30 }]);

    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, service_id: 'svc_1',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 25,
    });
    expect(res.status).toBe(201);
    // A blank cell round-trips as null (see src/testUtils/fakeAdapter.ts), matching
    // live Google Sheets behavior — not the '' that was written.
    expect(res.body.reservation).toMatchObject({ service_id: 'svc_1', service_name: 'Chef Tasting Menu', restaurant_id: null, nights: 2, total: 50 });
  });

  it('books against a catalog item via item_id, denormalizing restaurant_id and name', async () => {
    fakeDb.seed('admin', 'catalog_items', [{ item_id: 'item_1', restaurant_id: 'restaurant_9', name: 'Private Dining', active: true }]);

    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 40,
    });
    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({ service_id: 'item_1', service_name: 'Private Dining', restaurant_id: 'restaurant_9' });
  });

  it('rejects an inactive catalog item', async () => {
    fakeDb.seed('admin', 'catalog_items', [{ item_id: 'item_1', restaurant_id: 'restaurant_9', name: 'Retired Service', active: false }]);
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 40,
    });
    expect(res.status).toBe(400);
  });

  it('rejects when both service_id and item_id are given', async () => {
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, service_id: 'svc_1', item_id: 'item_1',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 40,
    });
    expect(res.status).toBe(400);
  });

  it('rejects when neither service_id nor item_id are given', async () => {
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2,
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 40,
    });
    expect(res.status).toBe(400);
  });

  it('404s an unknown item_id', async () => {
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, item_id: 'ghost',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 40,
    });
    expect(res.status).toBe(404);
  });

  it('decrements product quantity on reservation and blocks at 0', async () => {
    fakeDb.seed('admin', 'catalog_items', [{
      item_id: 'item_1', restaurant_id: 'restaurant_9', item_type: 'product', name: 'Leash', active: true, quantity: 1,
    }]);

    const first = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 40,
    });
    expect(first.status).toBe(201);

    const second = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Jordan Lee', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-04', end_date: '2026-08-05', daily_rate: 40,
    });
    expect(second.status).toBe(400);
  });

  it('does not touch quantity for a product with unlimited stock (quantity unset)', async () => {
    fakeDb.seed('admin', 'catalog_items', [{
      item_id: 'item_1', restaurant_id: 'restaurant_9', item_type: 'product', name: 'Leash', active: true,
    }]);
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 40,
    });
    expect(res.status).toBe(201);
  });

  it('rejects an overlapping service reservation once daily_capacity is reached', async () => {
    fakeDb.seed('admin', 'catalog_items', [{
      item_id: 'item_1', restaurant_id: 'restaurant_9', item_type: 'service', name: 'Table Reservation', active: true, daily_capacity: 1,
    }]);
    fakeDb.seed('admin', 'users', [{
      user_id: 'u_test_1', email: 'user@test.local', full_name: 'Test User', role: 'user',
      auth_provider: 'email', actor_sheet_id: 'sheet_1', status: 'active',
    }]);

    const first = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 20,
    });
    expect(first.status).toBe(201);

    const overlapping = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Jordan Lee', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-02', end_date: '2026-08-04', daily_rate: 20,
    });
    expect(overlapping.status).toBe(409);

    const nonOverlapping = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Sam Ortiz', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-10', end_date: '2026-08-11', daily_rate: 20,
    });
    expect(nonOverlapping.status).toBe(201);
  });

  it('books a direct table reservation via restaurant_id alone, defaulting end_date/daily_rate and storing reservation_time', async () => {
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_9', name: 'Test Restaurant', status: 'active' }]);

    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, restaurant_id: 'restaurant_9',
      start_date: '2026-08-01', reservation_time: '19:30', notes: 'Window seat',
    });
    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({
      service_id: null,
      service_name: null,
      restaurant_id: 'restaurant_9',
      start_date: '2026-08-01',
      end_date: '2026-08-01',
      daily_rate: 0,
      reservation_time: '19:30',
      nights: 1,
      total: 0,
      status: 'pending',
    });
  });

  it('accepts an explicit end_date/daily_rate in restaurant_id-only mode', async () => {
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_9', name: 'Test Restaurant', status: 'active' }]);

    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, restaurant_id: 'restaurant_9',
      start_date: '2026-08-01', end_date: '2026-08-01', daily_rate: 15,
    });
    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({ restaurant_id: 'restaurant_9', end_date: '2026-08-01', daily_rate: 15 });
  });

  it('404s a restaurant_id that does not exist', async () => {
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, restaurant_id: 'ghost_restaurant',
      start_date: '2026-08-01',
    });
    expect(res.status).toBe(404);
  });

  it('404s a restaurant_id that exists but is not active (same as unknown, no status leak)', async () => {
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_9', name: 'Pending Restaurant', status: 'pending' }]);
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, restaurant_id: 'restaurant_9',
      start_date: '2026-08-01',
    });
    expect(res.status).toBe(404);
  });

  it('books against an unclaimed restaurant (no owner registered yet)', async () => {
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_9', name: 'Unclaimed Restaurant', status: 'unclaimed', owner_user_id: '' }]);
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, restaurant_id: 'restaurant_9',
      start_date: '2026-08-01',
    });
    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({ restaurant_id: 'restaurant_9' });
  });

  it('rejects restaurant_id combined with service_id', async () => {
    fakeDb.seed('admin', 'restaurants', [{ restaurant_id: 'restaurant_9', name: 'Test Restaurant', status: 'active' }]);
    const res = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, restaurant_id: 'restaurant_9', service_id: 'svc_1',
      start_date: '2026-08-01', end_date: '2026-08-02', daily_rate: 10,
    });
    expect(res.status).toBe(400);
  });

  it('restocks a product on user self-cancel', async () => {
    fakeDb.seed('admin', 'catalog_items', [{
      item_id: 'item_1', restaurant_id: 'restaurant_9', item_type: 'product', name: 'Leash', active: true, quantity: 1,
    }]);
    const created = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Alex Tran', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-01', end_date: '2026-08-03', daily_rate: 40,
    });
    expect(created.status).toBe(201);

    const reservationId = created.body.reservation.reservation_id;
    const cancelled = await request(app).patch(`/user/reservations/${reservationId}`).set(auth).send({ status: 'cancelled' });
    expect(cancelled.status).toBe(200);

    const rebooked = await request(app).post('/user/reservations').set(auth).send({
      guest_name: 'Jordan Lee', party_size: 2, item_id: 'item_1',
      start_date: '2026-08-10', end_date: '2026-08-11', daily_rate: 40,
    });
    expect(rebooked.status).toBe(201);
  });
});
