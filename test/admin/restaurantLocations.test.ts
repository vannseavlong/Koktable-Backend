import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/adapter', async () => await import('../../src/testUtils/fakeAdapter'));

import { buildTestApp } from '../helpers/testApp';
import { adminToken } from '../helpers/auth';
import * as fakeDb from '../../src/testUtils/fakeAdapter';

const app = buildTestApp();
const auth = { Authorization: `Bearer ${adminToken()}` };

function seedRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurants', [{
    restaurant_id: 'restaurant_1', owner_user_id: '', name: 'Test Restaurant', description: '', logo: '',
    contact_email: 'restaurant@test.local', contact_phone: '', status: 'active',
    ...overrides,
  }]);
}

function seedLocation(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'restaurant_locations', [{
    location_id: 'loc_1', restaurant_id: 'restaurant_1', name: '', contact_email: '', contact_phone: '',
    address: '', city: '', latitude: null, longitude: null, active: true,
    ...overrides,
  }]);
}

describe('/admin/restaurants/:id/locations', () => {
  beforeEach(() => fakeDb.reset());

  describe('POST /admin/restaurants/:id/locations', () => {
    it('creates a location for a restaurant', async () => {
      seedRestaurant();

      const res = await request(app)
        .post('/admin/restaurants/restaurant_1/locations')
        .set(auth)
        .send({ name: 'Downtown Branch', address: '123 Main St', city: 'Phnom Penh' });

      expect(res.status).toBe(201);
      expect(res.body.location.restaurant_id).toBe('restaurant_1');
      expect(res.body.location.name).toBe('Downtown Branch');
      expect(res.body.location.address).toBe('123 Main St');
      expect(res.body.location.active).toBe(true);
      expect(res.body.location.location_id).toMatch(/^loc_/);
    });

    it('404s creating a location for an unknown restaurant', async () => {
      const res = await request(app)
        .post('/admin/restaurants/nope/locations')
        .set(auth)
        .send({ name: 'Branch' });

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /admin/restaurants/:id/locations/:locationId', () => {
    it('updates a location', async () => {
      seedRestaurant();
      seedLocation();

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/locations/loc_1')
        .set(auth)
        .send({ name: 'Updated Name', city: 'Siem Reap' });

      expect(res.status).toBe(200);
      expect(res.body.location.name).toBe('Updated Name');
      expect(res.body.location.city).toBe('Siem Reap');
    });

    it('404s updating a location for an unknown restaurant', async () => {
      const res = await request(app)
        .patch('/admin/restaurants/nope/locations/loc_1')
        .set(auth)
        .send({ name: 'X' });

      expect(res.status).toBe(404);
    });

    it('404s updating an unknown location', async () => {
      seedRestaurant();

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/locations/nope')
        .set(auth)
        .send({ name: 'X' });

      expect(res.status).toBe(404);
    });

    it('404s when the location belongs to a different restaurant', async () => {
      seedRestaurant({ restaurant_id: 'restaurant_1' });
      seedRestaurant({ restaurant_id: 'restaurant_2' });
      seedLocation({ location_id: 'loc_1', restaurant_id: 'restaurant_2' });

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/locations/loc_1')
        .set(auth)
        .send({ name: 'X' });

      expect(res.status).toBe(404);
    });

    it('deactivates a location that is not the only active one', async () => {
      seedRestaurant();
      seedLocation({ location_id: 'loc_1', active: true });
      seedLocation({ location_id: 'loc_2', active: true });

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/locations/loc_1')
        .set(auth)
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.location.active).toBe(false);
    });

    it('rejects deactivating the only active location', async () => {
      seedRestaurant();
      seedLocation({ location_id: 'loc_1', active: true });

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/locations/loc_1')
        .set(auth)
        .send({ active: false });

      expect(res.status).toBe(400);
    });

    it('rejects deactivating the only active location even when other inactive locations exist', async () => {
      seedRestaurant();
      seedLocation({ location_id: 'loc_1', active: true });
      seedLocation({ location_id: 'loc_2', active: false });

      const res = await request(app)
        .patch('/admin/restaurants/restaurant_1/locations/loc_1')
        .set(auth)
        .send({ active: false });

      expect(res.status).toBe(400);
    });
  });
});
