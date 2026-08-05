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
    status: 'active',
    ...overrides,
  }]);
}

function seedLocation(restaurantId = 'restaurant_1', overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurant_locations', [{
    location_id: `loc_${restaurantId}`, restaurant_id: restaurantId,
    contact_email: 'restaurant@test.local', contact_phone: '',
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
    });
    expect(res.status).toBe(200);
    expect(res.body.restaurant).toMatchObject({
      restaurant_id: 'restaurant_1',
      description: 'Now with private dining rooms',
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

    const res = await request(app).patch('/merchant/restaurant').set(merchAuth).send({ status: 'suspended', description: 'still open' });
    expect(res.status).toBe(200);
    expect(res.body.restaurant.status).toBe('active');
    expect(res.body.restaurant.description).toBe('still open');
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

  it('replaces the restaurant\'s weekly hours', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).put('/merchant/restaurant/hours').set(merchAuth).send({
      days: [
        { day_of_week: 'monday', closed: true },
        { day_of_week: 'tuesday', periods: [{ open: '11:00', close: '22:00' }] },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.hours).toHaveLength(2);
    expect(res.body.hours[0]).toMatchObject({ day_of_week: 'monday', closed: true });
    expect(res.body.hours[1]).toMatchObject({ day_of_week: 'tuesday', periods: [{ open: '11:00', close: '22:00' }] });

    const getRes = await request(app).get('/merchant/restaurant').set(merchAuth);
    expect(getRes.body.restaurant.hours).toHaveLength(2);
  });

  it('rejects an invalid hours submission', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).put('/merchant/restaurant/hours').set(merchAuth).send({
      days: [{ day_of_week: 'monday', closed: true, open_24h: true }],
    });
    expect(res.status).toBe(400);
  });

  it('updates the primary location when one already exists', async () => {
    seedRestaurant('restaurant_1');
    seedLocation('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).patch('/merchant/restaurant/location').set(merchAuth).send({
      contact_phone: '+1 555 0199',
      address: '1 Main St',
    });
    expect(res.status).toBe(200);
    expect(res.body.location).toMatchObject({ contact_phone: '+1 555 0199', address: '1 Main St' });

    const getRes = await request(app).get('/merchant/restaurant').set(merchAuth);
    expect(getRes.body.restaurant.location).toMatchObject({ contact_phone: '+1 555 0199' });
  });

  it('creates a primary location if this restaurant somehow has none yet', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).patch('/merchant/restaurant/location').set(merchAuth).send({
      contact_phone: '+1 555 0199',
    });
    expect(res.status).toBe(200);
    expect(res.body.location).toMatchObject({ restaurant_id: 'restaurant_1', contact_phone: '+1 555 0199' });
  });
});
