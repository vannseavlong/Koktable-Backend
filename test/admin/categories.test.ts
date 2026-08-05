import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

describe('/admin/categories', () => {
  beforeEach(() => fakeDb.reset());

  it('creates a category with valid input', async () => {
    const res = await request(app).post('/admin/categories').set(auth).send({
      name: 'Fine Dining', icon: '🛁',
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toMatchObject({ name: 'Fine Dining', icon: '🛁', active: true, sort_order: 0 });
  });

  it('rejects create with missing name', async () => {
    const res = await request(app).post('/admin/categories').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('lists categories filtered by active', async () => {
    fakeDb.seed('admin', 'categories', [
      { category_id: 'c1', name: 'A', active: true,  sort_order: 0 },
      { category_id: 'c2', name: 'B', active: false, sort_order: 1 },
    ]);
    const res = await request(app).get('/admin/categories?active=true').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].category_id).toBe('c1');
  });

  it('404s getById for an unknown category', async () => {
    const res = await request(app).get('/admin/categories/does-not-exist').set(auth);
    expect(res.status).toBe(404);
  });

  it('hard-deletes a category', async () => {
    fakeDb.seed('admin', 'categories', [
      { category_id: 'c1', name: 'A', active: true, sort_order: 0 },
    ]);
    const del = await request(app).delete('/admin/categories/c1').set(auth);
    expect(del.status).toBe(204);

    const get = await request(app).get('/admin/categories/c1').set(auth);
    expect(get.status).toBe(404);
  });

  it('reorders categories by the given id sequence', async () => {
    fakeDb.seed('admin', 'categories', [
      { category_id: 'c1', name: 'A', active: true, sort_order: 0 },
      { category_id: 'c2', name: 'B', active: true, sort_order: 1 },
    ]);
    const res = await request(app).patch('/admin/categories/reorder').set(auth).send({ order: ['c2', 'c1'] });
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.categories.map((c: { category_id: string; sort_order: number }) => [c.category_id, c.sort_order]));
    expect(byId.c2).toBe(0);
    expect(byId.c1).toBe(1);
  });
});

describe('GET /user/categories (public)', () => {
  beforeEach(() => fakeDb.reset());

  it('returns only active categories, sorted by sort_order', async () => {
    fakeDb.seed('admin', 'categories', [
      { category_id: 'c1', name: 'A', active: true,  sort_order: 1 },
      { category_id: 'c2', name: 'B', active: false, sort_order: 0 },
      { category_id: 'c3', name: 'C', active: true,  sort_order: 0 },
    ]);
    const res = await request(app).get('/user/categories');
    expect(res.status).toBe(200);
    expect(res.body.categories.map((c: { category_id: string }) => c.category_id)).toEqual(['c3', 'c1']);
  });
});
