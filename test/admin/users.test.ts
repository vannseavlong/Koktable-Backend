import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

function seedUsers() {
  fakeDb.seed('admin', 'users', [
    { user_id: 'u_1', email: 'jamie@test.local',  full_name: 'Jamie Rivera',  role: 'user',     auth_provider: 'email', actor_sheet_id: 'sh_1', status: 'active' },
    { user_id: 'u_2', email: 'taylor@test.local', full_name: 'Taylor Nguyen', role: 'user',     auth_provider: 'email', actor_sheet_id: 'sh_2', status: 'inactive' },
    { user_id: 'u_3', email: 'admin@test.local',  full_name: 'Admin Person',  role: 'admin',    auth_provider: 'email', actor_sheet_id: '',     status: 'active' },
  ]);
}

describe('/admin/users', () => {
  beforeEach(() => fakeDb.reset());

  it('lists all users', async () => {
    seedUsers();
    const res = await request(app).get('/admin/users').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
  });

  it('filters by role and status', async () => {
    seedUsers();
    const res = await request(app).get('/admin/users?role=user&status=active').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.users.map((u: { user_id: string }) => u.user_id)).toEqual(['u_1']);
  });

  it('searches by name or email, case-insensitively', async () => {
    seedUsers();
    const res = await request(app).get('/admin/users?search=TAYLOR').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.users.map((u: { user_id: string }) => u.user_id)).toEqual(['u_2']);
  });

  it('404s getById for an unknown user', async () => {
    const res = await request(app).get('/admin/users/nope').set(auth);
    expect(res.status).toBe(404);
  });

  it('toggles a user to inactive and back', async () => {
    seedUsers();
    const off = await request(app).patch('/admin/users/u_1').set(auth).send({ status: 'inactive' });
    expect(off.status).toBe(200);
    expect(off.body.user.status).toBe('inactive');

    const on = await request(app).patch('/admin/users/u_1').set(auth).send({ status: 'active' });
    expect(on.body.user.status).toBe('active');
  });

  it('rejects an invalid status value', async () => {
    seedUsers();
    const res = await request(app).patch('/admin/users/u_1').set(auth).send({ status: 'banned' });
    expect(res.status).toBe(400);
  });
});
