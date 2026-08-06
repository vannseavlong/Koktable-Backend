import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

describe('/admin/cuisines', () => {
  beforeEach(() => fakeDb.reset());

  it('creates a cuisine with valid input', async () => {
    const res = await request(app).post('/admin/cuisines').set(auth).send({
      name: 'Khmer', icon: '🍲',
    });
    expect(res.status).toBe(201);
    expect(res.body.cuisine).toMatchObject({ name: 'Khmer', icon: '🍲', active: true, sort_order: 0 });
  });

  it('rejects create with missing name', async () => {
    const res = await request(app).post('/admin/cuisines').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('lists cuisines filtered by active', async () => {
    fakeDb.seed('admin', 'cuisines', [
      { cuisine_id: 'c1', name: 'A', active: true,  sort_order: 0 },
      { cuisine_id: 'c2', name: 'B', active: false, sort_order: 1 },
    ]);
    const res = await request(app).get('/admin/cuisines?active=true').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.cuisines).toHaveLength(1);
    expect(res.body.cuisines[0].cuisine_id).toBe('c1');
  });

  it('404s getById for an unknown cuisine', async () => {
    const res = await request(app).get('/admin/cuisines/does-not-exist').set(auth);
    expect(res.status).toBe(404);
  });

  it('hard-deletes a cuisine', async () => {
    fakeDb.seed('admin', 'cuisines', [
      { cuisine_id: 'c1', name: 'A', active: true, sort_order: 0 },
    ]);
    const del = await request(app).delete('/admin/cuisines/c1').set(auth);
    expect(del.status).toBe(204);

    const get = await request(app).get('/admin/cuisines/c1').set(auth);
    expect(get.status).toBe(404);
  });

  it('reorders cuisines by the given id sequence', async () => {
    fakeDb.seed('admin', 'cuisines', [
      { cuisine_id: 'c1', name: 'A', active: true, sort_order: 0 },
      { cuisine_id: 'c2', name: 'B', active: true, sort_order: 1 },
    ]);
    const res = await request(app).patch('/admin/cuisines/reorder').set(auth).send({ order: ['c2', 'c1'] });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.cuisines.map((c: { cuisine_id: string; sort_order: number }) => [c.cuisine_id, c.sort_order]));
    expect(byId.c2).toBe(0);
    expect(byId.c1).toBe(1);
  });
});

describe('GET /user/cuisines (public)', () => {
  beforeEach(() => fakeDb.reset());

  it('returns only active cuisines, sorted by sort_order', async () => {
    fakeDb.seed('admin', 'cuisines', [
      { cuisine_id: 'c1', name: 'A', active: true,  sort_order: 1, moderation_status: 'approved' },
      { cuisine_id: 'c2', name: 'B', active: false, sort_order: 0, moderation_status: 'approved' },
      { cuisine_id: 'c3', name: 'C', active: true,  sort_order: 0, moderation_status: 'approved' },
    ]);
    const res = await request(app).get('/user/cuisines');
    expect(res.status).toBe(200);
    expect(res.body.cuisines.map((c: { cuisine_id: string }) => c.cuisine_id)).toEqual(['c3', 'c1']);
  });
});
