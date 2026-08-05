import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { vi } from 'vitest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { merchantToken, adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();

function seedRestaurant(restaurantId = 'restaurant_1', overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurants', [{
    restaurant_id: restaurantId, owner_user_id: 'm_1', name: 'Test Restaurant', description: '', logo: '',
    contact_email: 'restaurant@test.local', contact_phone: '', hours: '', status: 'active',
    ...overrides,
  }]);
}

describe('/merchant/restaurant (restaurant-scoped)', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects a non-merchant role', async () => {
    const res = await request(app).get('/merchant/restaurant').set({ Authorization: `Bearer ${adminToken()}` });
    expect(res.status).toBe(403);
  });

  it('422s when the merchant token has no restaurant_id', async () => {
    const res = await request(app).get('/merchant/restaurant').set({ Authorization: `Bearer ${merchantToken('')}` });
    expect(res.status).toBe(422);
  });

  it('returns the caller\'s own restaurant', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).get('/merchant/restaurant').set(merchAuth);
    expect(res.status).toBe(200);
    expect(res.body.restaurant.restaurant_id).toBe('restaurant_1');
  });

  it('404s if the restaurant row is somehow missing', async () => {
    const merchAuth = { Authorization: `Bearer ${merchantToken('ghost')}` };
    const res = await request(app).get('/merchant/restaurant').set(merchAuth);
    expect(res.status).toBe(404);
  });

  it('updates allowed fields', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).patch('/merchant/restaurant').set(merchAuth).send({
      description: 'Now with private dining rooms',
      contact_phone: '+1 555 0199',
      hours: 'Mon-Fri 9-5',
    });
    expect(res.status).toBe(200);
    expect(res.body.restaurant).toMatchObject({
      restaurant_id: 'restaurant_1',
      description: 'Now with private dining rooms',
      contact_phone: '+1 555 0199',
      hours: 'Mon-Fri 9-5',
    });
  });

  it('uploads a logo/banner via multipart and best-effort deletes the previous ones on replace', async () => {
    seedRestaurant('restaurant_1', { logo: 'fake://upload/old-logo.png', banner: 'fake://upload/old-banner.png' });
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };
    const deleteSpy = vi.spyOn(fakeDb.adapter, 'deleteFile');

    const res = await request(app)
      .patch('/merchant/restaurant')
      .set(merchAuth)
      .attach('logo', Buffer.from('fake-image-bytes'), { filename: 'logo.png', contentType: 'image/png' })
      .attach('banner', Buffer.from('fake-image-bytes'), { filename: 'banner.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.restaurant.logo).toMatch(/^fake:\/\/upload\//);
    expect(res.body.restaurant.banner).toMatch(/^fake:\/\/upload\//);
    expect(deleteSpy).toHaveBeenCalledWith('fake://upload/old-logo.png');
    expect(deleteSpy).toHaveBeenCalledWith('fake://upload/old-banner.png');
  });

  it('clears the logo when sent as an explicit empty string with no file attached', async () => {
    seedRestaurant('restaurant_1', { logo: 'fake://upload/old-logo.png' });
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app)
      .patch('/merchant/restaurant')
      .set(merchAuth)
      .field('logo', '');

    expect(res.status).toBe(200);
    expect(res.body.restaurant.logo).toBeFalsy();
  });

  it('rejects blanking out the required name field', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).patch('/merchant/restaurant').set(merchAuth).send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('ignores an attempt to change status via this endpoint', async () => {
    seedRestaurant('restaurant_1', { status: 'active' });
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).patch('/merchant/restaurant').set(merchAuth).send({ status: 'suspended', hours: '24/7' });
    expect(res.status).toBe(200);
    expect(res.body.restaurant.status).toBe('active');
  });

  it('never lets a merchant see or edit another restaurant\'s row', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2', { name: 'Other Restaurant' });

    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };
    const get = await request(app).get('/merchant/restaurant').set(merchAuth);
    expect(get.body.restaurant.restaurant_id).toBe('restaurant_1');

    const patch = await request(app).patch('/merchant/restaurant').set(merchAuth).send({ name: 'Hijacked' });
    expect(patch.body.restaurant.restaurant_id).toBe('restaurant_1');

    const other = await request(app).get('/merchant/restaurant').set({ Authorization: `Bearer ${merchantToken('restaurant_2')}` });
    expect(other.body.restaurant.name).toBe('Other Restaurant');
  });
});
