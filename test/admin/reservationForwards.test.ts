import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

function seedUser(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'users', [{
    user_id: 'u_1', email: 'jamie@test.local', full_name: 'Jamie Rivera', role: 'user',
    auth_provider: 'email', actor_sheet_id: 'sheet_1', status: 'active',
    ...overrides,
  }]);
}

function seedReservation(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('sheet_1', 'reservations', [{
    reservation_id: 'rsv_1', guest_name: 'Alex Tran', party_size: 2, service_id: 'svc_1',
    service_name: 'Bath', start_date: '2026-08-01', end_date: '2026-08-03',
    daily_rate: 25, notes: '', status: 'pending', restaurant_id: '',
    ...overrides,
  }]);
}

describe('/admin/reservations/:id/forwards', () => {
  beforeEach(() => fakeDb.reset());

  it('logs a forward and flips the reservation to forwarded', async () => {
    seedUser();
    seedReservation();

    const res = await request(app)
      .post('/admin/reservations/rsv_1/forwards')
      .set(auth)
      .send({ user_id: 'u_1', target_name: 'Malis Restaurant', channel: 'telegram', message: 'New booking for 2' });

    expect(res.status).toBe(201);
    expect(res.body.forward).toMatchObject({ reservation_id: 'rsv_1', channel: 'telegram', target_name: 'Malis Restaurant' });
    expect(res.body.forward.sla_due_at).toBeTruthy();

    const list = await request(app).get('/admin/reservations/rsv_1/forwards').set(auth);
    expect(list.body.forwards).toHaveLength(1);

    const reservation = await request(app).get('/admin/reservations/rsv_1?user_id=u_1').set(auth);
    expect(reservation.body.reservation.status).toBe('forwarded');
  });

  it('rejects an unknown channel', async () => {
    seedUser();
    seedReservation();
    const res = await request(app)
      .post('/admin/reservations/rsv_1/forwards')
      .set(auth)
      .send({ user_id: 'u_1', target_name: 'Malis Restaurant', channel: 'carrier_pigeon' });
    expect(res.status).toBe(400);
  });

  it('refuses to forward a reservation that is already confirmed', async () => {
    seedUser();
    seedReservation({ status: 'confirmed' });
    const res = await request(app)
      .post('/admin/reservations/rsv_1/forwards')
      .set(auth)
      .send({ user_id: 'u_1', target_name: 'Malis Restaurant', channel: 'call' });
    expect(res.status).toBe(409);
  });

  it('rejects setting status=forwarded directly through the plain status PATCH', async () => {
    seedUser();
    seedReservation();
    const res = await request(app)
      .patch('/admin/reservations/rsv_1')
      .set(auth)
      .send({ user_id: 'u_1', status: 'forwarded' });
    expect(res.status).toBe(400);
  });
});
