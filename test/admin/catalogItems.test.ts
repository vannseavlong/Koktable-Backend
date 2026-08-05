import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken, merchantToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

function seedRestaurant(restaurantId = 'restaurant_1') {
  fakeDb.seed('admin', 'restaurants', [{
    restaurant_id: restaurantId, owner_user_id: 'm_1', name: 'Test Restaurant', description: '', logo: '',
    contact_email: '', contact_phone: '', status: 'active',
  }]);
}

describe('/admin/catalog-items', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects create with no restaurant_id', async () => {
    const res = await request(app).post('/admin/catalog-items').set(auth).send({ name: 'Bath', price_from: 10 });
    expect(res.status).toBe(400);
  });

  it('404s create against an unknown restaurant', async () => {
    const res = await request(app).post('/admin/catalog-items').set(auth).send({ restaurant_id: 'ghost', name: 'Bath', price_from: 10 });
    expect(res.status).toBe(404);
  });

  it('creates an item for an existing restaurant, defaulting item_type to service', async () => {
    seedRestaurant();
    const res = await request(app).post('/admin/catalog-items').set(auth).send({ restaurant_id: 'restaurant_1', name: 'Bath', price_from: 10 });
    expect(res.status).toBe(201);
    expect(res.body.item).toMatchObject({ restaurant_id: 'restaurant_1', item_type: 'service', name: 'Bath', active: true });
  });

  it('rejects an invalid item_type', async () => {
    seedRestaurant();
    const res = await request(app).post('/admin/catalog-items').set(auth)
      .send({ restaurant_id: 'restaurant_1', name: 'Bath', price_from: 10, item_type: 'subscription' });
    expect(res.status).toBe(400);
  });

  it('filters list by restaurant_id and item_type', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    fakeDb.seed('admin', 'catalog_items', [
      { item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'service', name: 'A', price_from: 10, active: true, sort_order: 0 },
      { item_id: 'i2', restaurant_id: 'restaurant_1', item_type: 'product', name: 'B', price_from: 5,  active: true, sort_order: 1 },
      { item_id: 'i3', restaurant_id: 'restaurant_2', item_type: 'service', name: 'C', price_from: 8,  active: true, sort_order: 0 },
    ]);
    const res = await request(app).get('/admin/catalog-items?restaurant_id=restaurant_1&item_type=service').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { item_id: string }) => i.item_id)).toEqual(['i1']);
  });

  it('hard-deletes an item', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'catalog_items', [{ item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'service', name: 'A', price_from: 10, active: true, sort_order: 0 }]);
    const del = await request(app).delete('/admin/catalog-items/i1').set(auth);
    expect(del.status).toBe(204);
    const get = await request(app).get('/admin/catalog-items/i1').set(auth);
    expect(get.status).toBe(404);
  });
});

describe('/merchant/catalog-items (restaurant-scoped)', () => {
  beforeEach(() => fakeDb.reset());

  it('rejects a non-merchant role', async () => {
    const res = await request(app).get('/merchant/catalog-items').set(auth);
    expect(res.status).toBe(403);
  });

  it('lets a merchant manage their own restaurant items', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const create = await request(app).post('/merchant/catalog-items').set(merchAuth).send({ name: 'Fine Dining', price_from: 40 });
    expect(create.status).toBe(201);
    expect(create.body.item.restaurant_id).toBe('restaurant_1');

    const list = await request(app).get('/merchant/catalog-items').set(merchAuth);
    expect(list.body.items).toHaveLength(1);
  });

  it('404s when a merchant reaches for another restaurant\'s item', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    fakeDb.seed('admin', 'catalog_items', [{ item_id: 'i1', restaurant_id: 'restaurant_2', item_type: 'service', name: 'A', price_from: 10, active: true, sort_order: 0 }]);

    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };
    const res = await request(app).get('/merchant/catalog-items/i1').set(merchAuth);
    expect(res.status).toBe(404);
  });

  it('never trusts a client-supplied restaurant_id on create', async () => {
    seedRestaurant('restaurant_1');
    seedRestaurant('restaurant_2');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app).post('/merchant/catalog-items').set(merchAuth).send({ name: 'Sneaky', price_from: 1, restaurant_id: 'restaurant_2' });
    expect(res.status).toBe(201);
    // Scoped from the JWT, not the (ignored) body field.
    expect(res.body.item.restaurant_id).toBe('restaurant_1');
  });

  it('uploads an image via multipart (My Products) and coerces string fields', async () => {
    seedRestaurant('restaurant_1');
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };

    const res = await request(app)
      .post('/merchant/catalog-items')
      .set(merchAuth)
      .field('name', 'Golden Retriever Puppy')
      .field('item_type', 'product')
      .field('price_from', '450')
      .field('quantity', '3')
      .field('active', 'true')
      .attach('image', Buffer.from('fake-image-bytes'), { filename: 'puppy.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    expect(res.body.item.image).toMatch(/^fake:\/\/upload\//);
    expect(res.body.item.quantity).toBe(3);
    expect(res.body.item.active).toBe(true);
  });

  it('best-effort deletes the previous image from storage when replaced or the item is removed', async () => {
    seedRestaurant('restaurant_1');
    fakeDb.seed('admin', 'catalog_items', [{
      item_id: 'i1', restaurant_id: 'restaurant_1', item_type: 'product', name: 'Puppy', price_from: 450,
      image: 'fake://upload/old-image.jpg', active: true, sort_order: 0,
    }]);
    const merchAuth = { Authorization: `Bearer ${merchantToken('restaurant_1')}` };
    const deleteSpy = vi.spyOn(fakeDb.adapter, 'deleteFile');

    const update = await request(app)
      .patch('/merchant/catalog-items/i1')
      .set(merchAuth)
      .attach('image', Buffer.from('new-image-bytes'), { filename: 'puppy2.jpg', contentType: 'image/jpeg' });
    expect(update.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith('fake://upload/old-image.jpg');

    const del = await request(app).delete('/merchant/catalog-items/i1').set(merchAuth);
    expect(del.status).toBe(204);
    expect(deleteSpy).toHaveBeenCalledWith(update.body.item.image);
  });
});
