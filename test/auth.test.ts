import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/adapter', async () => await import('../src/testUtils/fakeAdapter'));

import { buildTestApp } from './helpers/testApp';
import { userToken, adminToken } from './helpers/auth';
import { signJwt } from '../src/middleware/auth';
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

describe('JWT exp enforcement', () => {
  beforeEach(() => fakeDb.reset());

  const basePayload = { user_id: 'u_test_1', email: 'user@test.local', full_name: 'Test User', role: 'user' };

  it('rejects an expired OAuth-style token (exp in the past)', async () => {
    const token = signJwt({ ...basePayload, exp: Math.floor(Date.now() / 1000) - 60 });
    const res = await request(app).get('/user/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('accepts a non-expired OAuth-style token (exp in the future)', async () => {
    const token = signJwt({ ...basePayload, exp: Math.floor(Date.now() / 1000) + 3600 });
    const res = await request(app).get('/user/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });

  it('accepts a password-login-style token with no exp claim', async () => {
    const token = userToken();
    const res = await request(app).get('/user/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(401);
  });
});
