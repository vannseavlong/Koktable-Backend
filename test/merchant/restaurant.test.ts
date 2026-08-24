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

  it('updates known_for and amenities', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).patch('/merchant/restaurant').set(merchAuth).send({
      known_for: 'Rooftop seating, live jazz',
      amenities: ['Wifi', 'Parking'],
    });
    expect(res.status).toBe(200);
    expect(res.body.restaurant).toMatchObject({
      known_for: 'Rooftop seating, live jazz',
      amenities: ['Wifi', 'Parking'],
    });
  });

  it('decodes amenities sent as a JSON string over multipart', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app)
      .patch('/merchant/restaurant')
      .set(merchAuth)
      .field('amenities', JSON.stringify(['Wifi', 'Outdoor seating']))
      .attach('logo', Buffer.from('fake-image-bytes'), { filename: 'logo.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.restaurant.amenities).toEqual(['Wifi', 'Outdoor seating']);
  });

  it('rejects a non-string-array amenities value', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).patch('/merchant/restaurant').set(merchAuth).send({
      amenities: ['Wifi', 42],
    });
    expect(res.status).toBe(400);
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

  it('creates a primary location first and scopes hours to it when none exists yet', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).put('/merchant/restaurant/hours').set(merchAuth).send({
      days: [{ day_of_week: 'monday', closed: true }],
    });
    expect(res.status).toBe(200);
    expect(res.body.hours).toHaveLength(1);

    const { adminContext } = await import('../../src/testUtils/fakeAdapter');
    const locations = await adminContext().table('restaurant_locations').findMany({ where: { restaurant_id: 'restaurant_1' } });
    expect(locations).toHaveLength(1);
    const hoursRows = await adminContext().table('restaurant_hours').findMany({ where: { restaurant_id: 'restaurant_1' } });
    expect(hoursRows).toHaveLength(1);
    expect(hoursRows[0]).toMatchObject({ location_id: (locations[0] as { location_id: string }).location_id });
  });

  it('rejects an invalid hours submission', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).put('/merchant/restaurant/hours').set(merchAuth).send({
      days: [{ day_of_week: 'monday', closed: true, open_24h: true }],
    });
    expect(res.status).toBe(400);
  });

  it('replaces the restaurant\'s cuisines', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'cuisines', [
      { cuisine_id: 'cui_khmer', name: 'Khmer', active: true, sort_order: 0 },
      { cuisine_id: 'cui_thai',  name: 'Thai',  active: true, sort_order: 1 },
    ]);
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).put('/merchant/restaurant/cuisines').set(merchAuth).send({
      cuisines: ['Khmer', 'Thai'],
    });
    expect(res.status).toBe(200);
    expect(res.body.cuisines.sort()).toEqual(['Khmer', 'Thai']);

    const getRes = await request(app).get('/merchant/restaurant').set(merchAuth);
    expect(getRes.body.restaurant.cuisines.sort()).toEqual(['Khmer', 'Thai']);
  });

  it('rejects a cuisines submission with an unknown cuisine name', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'cuisines', [
      { cuisine_id: 'cui_khmer', name: 'Khmer', active: true, sort_order: 0 },
    ]);
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).put('/merchant/restaurant/cuisines').set(merchAuth).send({
      cuisines: ['Atlantis'],
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

  it('uploads new gallery photos and appends them after the kept ones', async () => {
    seedRestaurant('restaurant_1', { gallery: ['fake://upload/old-1.png'] });
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app)
      .put('/merchant/restaurant/gallery')
      .set(merchAuth)
      .field('keep', JSON.stringify(['fake://upload/old-1.png']))
      .attach('gallery', Buffer.from('fake-image-bytes'), { filename: 'new-1.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.gallery).toHaveLength(2);
    expect(res.body.gallery[0]).toBe('fake://upload/old-1.png');
    expect(res.body.gallery[1]).toMatch(/^fake:\/\/upload\//);

    const getRes = await request(app).get('/merchant/restaurant').set(merchAuth);
    expect(getRes.body.restaurant.gallery).toEqual(res.body.gallery);
  });

  it('reorders and drops a kept gallery photo, best-effort deleting the dropped one', async () => {
    seedRestaurant('restaurant_1', {
      gallery: ['fake://upload/a.png', 'fake://upload/b.png', 'fake://upload/c.png'],
    });
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };
    const deleteSpy = vi.spyOn(fakeDb.adapter, 'deleteFile');

    const res = await request(app)
      .put('/merchant/restaurant/gallery')
      .set(merchAuth)
      .field('keep', JSON.stringify(['fake://upload/c.png', 'fake://upload/a.png']));

    expect(res.status).toBe(200);
    expect(res.body.gallery).toEqual(['fake://upload/c.png', 'fake://upload/a.png']);
    expect(deleteSpy).toHaveBeenCalledWith('fake://upload/b.png');
  });

  it('rejects a non-JSON keep field on the gallery endpoint', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app)
      .put('/merchant/restaurant/gallery')
      .set(merchAuth)
      .field('keep', 'not-json');
    expect(res.status).toBe(400);
  });

  it('never lets a merchant touch another restaurant\'s gallery', async () => {
    seedRestaurant('restaurant_1', { gallery: ['fake://upload/mine.png'] });
    seedRestaurant('restaurant_2', { gallery: ['fake://upload/theirs.png'] });
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app)
      .put('/merchant/restaurant/gallery')
      .set(merchAuth)
      .field('keep', JSON.stringify(['fake://upload/theirs.png']));

    expect(res.status).toBe(200);
    expect(res.body.gallery).toEqual(['fake://upload/theirs.png']);

    const other = await request(app).get('/merchant/restaurant').set({ Authorization: `Bearer ${merchantToken('restaurant_2')}` });
    expect(other.body.restaurant.gallery).toEqual(['fake://upload/theirs.png']);
  });
});
