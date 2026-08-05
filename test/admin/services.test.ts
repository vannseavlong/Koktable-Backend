import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

describe('/admin/services', () => {
  beforeEach(() => fakeDb.reset());

  it('creates a service with valid input', async () => {
    const res = await request(app).post('/admin/services').set(auth).send({
      name: 'Chef Tasting Menu', price_from: 30, icon: 'bath', color: '#fff', category_id: 'fine_dining',
    });
    expect(res.status).toBe(201);
    expect(res.body.service).toMatchObject({ name: 'Chef Tasting Menu', price_from: 30, active: true, sort_order: 0 });
  });

  it('rejects create with missing required fields', async () => {
    const res = await request(app).post('/admin/services').set(auth).send({ name: 'No price' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price_from/);
  });

  it('lists services filtered by active', async () => {
    fakeDb.seed('admin', 'services', [
      { service_id: 's1', name: 'A', price_from: 10, icon: 'i', color: 'c', category_id: 'x', active: true,  sort_order: 0 },
      { service_id: 's2', name: 'B', price_from: 20, icon: 'i', color: 'c', category_id: 'x', active: false, sort_order: 1 },
    ]);
    const res = await request(app).get('/admin/services?active=true').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.services).toHaveLength(1);
    expect(res.body.services[0].service_id).toBe('s1');
  });

  it('404s getById for an unknown service', async () => {
    const res = await request(app).get('/admin/services/does-not-exist').set(auth);
    expect(res.status).toBe(404);
  });

  it('rejects update with a negative price_from', async () => {
    fakeDb.seed('admin', 'services', [
      { service_id: 's1', name: 'A', price_from: 10, icon: 'i', color: 'c', category_id: 'x', active: true, sort_order: 0 },
    ]);
    const res = await request(app).patch('/admin/services/s1').set(auth).send({ price_from: -5 });
    expect(res.status).toBe(400);
  });

  it('hard-deletes a service', async () => {
    fakeDb.seed('admin', 'services', [
      { service_id: 's1', name: 'A', price_from: 10, icon: 'i', color: 'c', category_id: 'x', active: true, sort_order: 0 },
    ]);
    const del = await request(app).delete('/admin/services/s1').set(auth);
    expect(del.status).toBe(204);

    const get = await request(app).get('/admin/services/s1').set(auth);
    expect(get.status).toBe(404);
  });

  it('reorders services by the given id sequence', async () => {
    fakeDb.seed('admin', 'services', [
      { service_id: 's1', name: 'A', price_from: 10, icon: 'i', color: 'c', category_id: 'x', active: true, sort_order: 0 },
      { service_id: 's2', name: 'B', price_from: 20, icon: 'i', color: 'c', category_id: 'x', active: true, sort_order: 1 },
    ]);
    const res = await request(app).patch('/admin/services/reorder').set(auth).send({ order: ['s2', 's1'] });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.services.map((s: { service_id: string; sort_order: number }) => [s.service_id, s.sort_order]));
    expect(byId.s2).toBe(0);
    expect(byId.s1).toBe(1);
  });
});
