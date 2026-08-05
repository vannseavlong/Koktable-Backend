import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken, userToken, merchantToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();

describe('requireAdmin guard on /admin/*', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authorization/i);
  });

  it('rejects a malformed/invalid token', async () => {
    const res = await request(app).get('/admin/users').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('rejects a valid token for a non-admin role', async () => {
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${userToken()}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin access required/i);
  });

  it('rejects a valid merchant token', async () => {
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${merchantToken('restaurant_1')}`);
    expect(res.status).toBe(403);
  });

  it('allows a valid admin token through', async () => {
    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('users');
  });
});
