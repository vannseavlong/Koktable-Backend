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

function seedReservation(actorSheetId: string, overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed(actorSheetId, 'reservations', [{
    reservation_id: 'rsv_1', guest_name: 'Alex Tran', party_size: 2, service_id: 'svc_1',
    service_name: 'Bath', start_date: '2026-08-01', end_date: '2026-08-03',
    daily_rate: 25, notes: '', status: 'pending', restaurant_id: '',
    ...overrides,
  }]);
}

describe('/admin/reservations', () => {
  beforeEach(() => fakeDb.reset());

  it('fans out across every user with a sheet and merges results', async () => {
    seedUser();
    seedReservation('sheet_1');
    const res = await request(app).get('/admin/reservations').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.reservations[0]).toMatchObject({ reservation_id: 'rsv_1', user_id: 'u_1', user_email: 'jamie@test.local', nights: 2, total: 50 });
  });

  it('ignores users with no actor_sheet_id', async () => {
    seedUser({ user_id: 'u_2', actor_sheet_id: '' });
    const res = await request(app).get('/admin/reservations').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('filters by restaurant_id', async () => {
    seedUser();
    seedReservation('sheet_1', { reservation_id: 'rsv_1', restaurant_id: 'restaurant_a' });
    seedReservation('sheet_1', { reservation_id: 'rsv_2', restaurant_id: 'restaurant_b' });

    const res = await request(app).get('/admin/reservations?restaurant_id=restaurant_a').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.reservations.map((b: { reservation_id: string }) => b.reservation_id)).toEqual(['rsv_1']);
  });

  it('requires user_id to fetch a single reservation', async () => {
    seedUser();
    seedReservation('sheet_1');
    const res = await request(app).get('/admin/reservations/rsv_1').set(auth);
    expect(res.status).toBe(400);
  });

  it('applies a valid status transition', async () => {
    seedUser();
    seedReservation('sheet_1', { status: 'pending' });
    const res = await request(app).patch('/admin/reservations/rsv_1').set(auth).send({ user_id: 'u_1', status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe('confirmed');
  });

  it('rejects an invalid status transition', async () => {
    seedUser();
    seedReservation('sheet_1', { status: 'pending' });
    const res = await request(app).patch('/admin/reservations/rsv_1').set(auth).send({ user_id: 'u_1', status: 'completed' });
    expect(res.status).toBe(409);
  });

  it('rejects an unknown status value', async () => {
    seedUser();
    seedReservation('sheet_1', { status: 'pending' });
    const res = await request(app).patch('/admin/reservations/rsv_1').set(auth).send({ user_id: 'u_1', status: 'bogus' });
    expect(res.status).toBe(400);
  });
});
