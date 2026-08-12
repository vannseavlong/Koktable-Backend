import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/adapter', async () => await import('../src/testUtils/fakeAdapter'));

import { buildTestApp } from './helpers/testApp';
import { userToken, adminToken } from './helpers/auth';
import * as fakeDb from '../src/testUtils/fakeAdapter';

const app = buildTestApp();

describe('POST /user/auth/logout', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects with no Authorization header', async () => {
    const res = await request(app).post('/user/auth/logout');
    expect(res.status).toBe(401);
  });

  it('revokes the presented token: a subsequent request with the same token is rejected', async () => {
    const token = userToken();

    // Still valid before logout.
    const before = await request(app).get('/user/auth/me').set('Authorization', `Bearer ${token}`);
    expect(before.status).not.toBe(401);

    const logoutRes = await request(app).post('/user/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(logoutRes.status).toBe(204);

    const after = await request(app).get('/user/auth/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
    expect(after.body.error).toMatch(/invalid or expired/i);
  });

  it("doesn't affect a different, still-valid token", async () => {
    const revoked = userToken({ user_id: 'u_revoked' });
    const other   = userToken({ user_id: 'u_still_valid' });

    await request(app).post('/user/auth/logout').set('Authorization', `Bearer ${revoked}`).expect(204);

    const res = await request(app).get('/user/auth/me').set('Authorization', `Bearer ${other}`);
    expect(res.status).not.toBe(401);
  });

  it('revoking an admin token blocks it from admin-only routes too', async () => {
    const token = adminToken();
    await request(app).post('/user/auth/logout').set('Authorization', `Bearer ${token}`).expect(204);

    const res = await request(app).get('/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
