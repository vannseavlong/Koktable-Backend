import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken, merchantToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();

function seedUser(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'users', [{
    user_id: 'u_1', email: 'jamie@test.local', full_name: 'Jamie Rivera', role: 'user',
    auth_provider: 'email', actor_sheet_id: 'sheet_1', status: 'active',
    ...overrides,
  }]);
}

function seedReservation(actorSheetId: string, overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed(actorSheetId, 'reservations', [{
    reservation_id: 'rsv_1', guest_name: 'Alex Tran', party_size: 2, service_id: 'item_1',
    service_name: 'Private Dining', start_date: '2026-08-01', end_date: '2026-08-03',
    daily_rate: 25, notes: '', status: 'pending', restaurant_id: 'restaurant_1',
    ...overrides,
  }]);
}

describe('/merchant/orders (restaurant-scoped)', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects a non-merchant role', async () => {
    const res = await request(app).get('/merchant/orders').set({ Authorization: `Bearer ${adminToken()}` });
    expect(res.status).toBe(403);
  });

  it('422s when the merchant token has no restaurant_id', async () => {
    const res = await request(app).get('/merchant/orders').set({ Authorization: `Bearer ${merchantToken('')}` });
    expect(res.status).toBe(422);
  });

  it('only returns orders for the caller\'s own restaurant', async () => {
    seedUser();
    seedReservation('sheet_1', { reservation_id: 'rsv_1', restaurant_id: 'restaurant_1' });
    seedReservation('sheet_1', { reservation_id: 'rsv_2', restaurant_id: 'restaurant_2' });

    const res = await request(app).get('/merchant/orders').set({ Authorization: `Bearer ${merchantToken('restaurant_1')}` });
    expect(res.status).toBe(200);
    expect(res.body.orders.map((o: { reservation_id: string }) => o.reservation_id)).toEqual(['rsv_1']);
    expect(res.body.orders[0]).toMatchObject({ user_id: 'u_1', user_email: 'jamie@test.local' });
  });

  it('ignores legacy reservations with a blank restaurant_id', async () => {
    seedUser();
    seedReservation('sheet_1', { restaurant_id: '' });
    const res = await request(app).get('/merchant/orders').set({ Authorization: `Bearer ${merchantToken('restaurant_1')}` });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('404s a single order that belongs to another restaurant', async () => {
    seedUser();
    seedReservation('sheet_1', { restaurant_id: 'restaurant_2' });
    const res = await request(app).get('/merchant/orders/rsv_1?user_id=u_1').set({ Authorization: `Bearer ${merchantToken('restaurant_1')}` });
    expect(res.status).toBe(404);
  });

  it('applies a valid status transition for the caller\'s own order', async () => {
    seedUser();
    seedReservation('sheet_1', { status: 'pending' });
    const res = await request(app).patch('/merchant/orders/rsv_1').set({ Authorization: `Bearer ${merchantToken('restaurant_1')}` })
      .send({ user_id: 'u_1', status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('confirmed');
  });

  it('404s a status transition attempted against another restaurant\'s order', async () => {
    seedUser();
    seedReservation('sheet_1', { restaurant_id: 'restaurant_2', status: 'pending' });
    const res = await request(app).patch('/merchant/orders/rsv_1').set({ Authorization: `Bearer ${merchantToken('restaurant_1')}` })
      .send({ user_id: 'u_1', status: 'confirmed' });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid status transition', async () => {
    seedUser();
    seedReservation('sheet_1', { status: 'pending' });
    const res = await request(app).patch('/merchant/orders/rsv_1').set({ Authorization: `Bearer ${merchantToken('restaurant_1')}` })
      .send({ user_id: 'u_1', status: 'completed' });
    expect(res.status).toBe(409);
  });

  it('restocks a product when its order is cancelled', async () => {
    seedUser();
    fakeDb.seed('admin', 'catalog_items', [{
      item_id: 'item_1', restaurant_id: 'restaurant_1', item_type: 'product', name: 'Leash', price_from: 20, active: true, sort_order: 0, quantity: 2,
    }]);
    seedReservation('sheet_1', { status: 'pending' });

    const res = await request(app).patch('/merchant/orders/rsv_1').set({ Authorization: `Bearer ${merchantToken('restaurant_1')}` })
      .send({ user_id: 'u_1', status: 'cancelled' });
    expect(res.status).toBe(200);

    const item = await request(app).get('/merchant/catalog-items/item_1').set({ Authorization: `Bearer ${merchantToken('restaurant_1')}` });
    expect(item.body.item.quantity).toBe(3);
  });
});
