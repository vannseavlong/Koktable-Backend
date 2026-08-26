import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { vi } from 'vitest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

function isoDate(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

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
    service_name: 'Dinner', start_date: isoDate(1), end_date: isoDate(1),
    daily_rate: 0, notes: '', status: 'confirmed', restaurant_id: 'restaurant_1',
    reservation_time: '19:30',
    ...overrides,
  }]);
}

function seedRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurants', [{
    restaurant_id: 'restaurant_1', owner_user_id: '', name: 'Test Restaurant', description: '', logo: '',
    contact_email: 'restaurant@test.local', contact_phone: '', status: 'active',
    ...overrides,
  }]);
}

function seedSubscription(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'subscriptions', [{
    subscription_id: 'sub_1', restaurant_id: 'restaurant_1', tier: 'pro', status: 'active',
    ...overrides,
  }]);
}

function seedInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'invoices', [{
    invoice_id: 'inv_1', restaurant_id: 'restaurant_1', subscription_id: 'sub_1', amount: 49,
    currency: 'USD', status: 'paid', billing_period_start: isoDate(30), billing_period_end: isoDate(0),
    due_date: isoDate(0), paid_at: isoDate(0), description: '',
    ...overrides,
  }]);
}

describe('/admin/dashboard/overview', () => {
  beforeEach(() => fakeDb.reset());

  it('aggregates reservations, billing, and merchant tiers', async () => {
    seedUser();
    seedReservation({ reservation_id: 'rsv_1', status: 'confirmed', start_date: isoDate(1), reservation_time: '19:30' });
    seedReservation({ reservation_id: 'rsv_2', status: 'cancelled', start_date: isoDate(2), reservation_time: '12:00' });
    seedRestaurant();
    seedSubscription({ subscription_id: 'sub_1', restaurant_id: 'restaurant_1', tier: 'pro', status: 'active' });
    seedSubscription({ subscription_id: 'sub_2', restaurant_id: 'restaurant_2', tier: 'basic', status: 'trialing' });
    seedInvoice({ invoice_id: 'inv_1', status: 'paid', amount: 49 });
    seedInvoice({ invoice_id: 'inv_2', status: 'pending', amount: 20, restaurant_id: 'restaurant_2', subscription_id: 'sub_2' });

    const res = await request(app).get('/admin/dashboard/overview').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.range).toBe('month');
    expect(res.body.reservations.total).toBe(2);
    expect(res.body.reservations.byStatus.confirmed).toBe(1);
    expect(res.body.reservations.byStatus.cancelled).toBe(1);
    expect(res.body.topRestaurants[0]).toMatchObject({ restaurant_id: 'restaurant_1', name: 'Test Restaurant', count: 2 });

    expect(res.body.merchants.total).toBe(2);
    expect(res.body.merchants.byTier).toEqual({ basic: 1, pro: 1 });
    expect(res.body.merchants.byStatus.active).toBe(1);
    expect(res.body.merchants.byStatus.trialing).toBe(1);

    expect(res.body.billing.byStatus.paid).toEqual({ count: 1, amount: 49 });
    expect(res.body.billing.byStatus.pending).toEqual({ count: 1, amount: 20 });
    expect(res.body.billing.totalAmount).toBe(69);
    expect(res.body.billing.paidAmount).toBe(49);
    expect(res.body.billing.outstandingAmount).toBe(20);
  });

  it('buckets peak hours by day-of-week and hour', async () => {
    seedUser();
    seedReservation({ reservation_id: 'rsv_1', start_date: isoDate(1), reservation_time: '19:30' });

    const res = await request(app).get('/admin/dashboard/overview').set(auth);

    expect(res.status).toBe(200);
    const peakHours = res.body.reservations.peakHours as number[][];
    expect(peakHours).toHaveLength(7);
    expect(peakHours.flat().reduce((a: number, b: number) => a + b, 0)).toBe(1);
    expect(peakHours.some((row) => row[19] === 1)).toBe(true);
  });

  it('excludes reservations without a reservation_time from peak hours but still counts them', async () => {
    seedUser();
    seedReservation({ reservation_id: 'rsv_1', start_date: isoDate(1), reservation_time: '' });

    const res = await request(app).get('/admin/dashboard/overview').set(auth);

    expect(res.body.reservations.total).toBe(1);
    expect((res.body.reservations.peakHours as number[][]).flat().reduce((a: number, b: number) => a + b, 0)).toBe(0);
  });

  it('excludes reservations outside the selected range', async () => {
    seedUser();
    seedReservation({ reservation_id: 'rsv_1', start_date: isoDate(1) });
    seedReservation({ reservation_id: 'rsv_2', start_date: isoDate(60) });

    const res = await request(app).get('/admin/dashboard/overview?range=week').set(auth);

    expect(res.status).toBe(200);
    expect(res.body.range).toBe('week');
    expect(res.body.reservations.total).toBe(1);
  });

  it('rejects an invalid range', async () => {
    const res = await request(app).get('/admin/dashboard/overview?range=year').set(auth);
    expect(res.status).toBe(400);
  });
});
