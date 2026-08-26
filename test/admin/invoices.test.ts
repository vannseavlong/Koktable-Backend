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

function seedInvoice(overrides: Partial<Record<string, unknown>> = {}) {
  fakeDb.seed('admin', 'invoices', [{
    invoice_id: 'inv_1', restaurant_id: 'restaurant_1', subscription_id: '', amount: 49,
    currency: 'USD', status: 'pending', billing_period_start: '2026-08-01', billing_period_end: '2026-08-31',
    due_date: '2026-08-31', paid_at: '', description: 'Pro plan — August 2026',
    ...overrides,
  }]);
}

describe('/admin/invoices', () => {
  beforeEach(() => fakeDb.reset());

  describe('GET /', () => {
    it('lists invoices for a restaurant', async () => {
      seedRestaurant();
      seedInvoice();

      const res = await request(app)
        .get('/admin/invoices')
        .query({ restaurant_id: 'restaurant_1' })
        .set(auth);

      expect(res.status).toBe(200);
      expect(res.body.invoices).toHaveLength(1);
      expect(res.body.invoices[0].invoice_id).toBe('inv_1');
      expect(res.body.total).toBe(1);
    });

    it('filters by status', async () => {
      seedRestaurant();
      seedInvoice({ invoice_id: 'inv_1', status: 'paid' });
      seedInvoice({ invoice_id: 'inv_2', status: 'pending' });

      const res = await request(app)
        .get('/admin/invoices')
        .query({ status: 'paid' })
        .set(auth);

      expect(res.status).toBe(200);
      expect(res.body.invoices.map((i: { invoice_id: string }) => i.invoice_id)).toEqual(['inv_1']);
    });
  });

  describe('POST /', () => {
    it('creates an invoice for a restaurant', async () => {
      seedRestaurant();

      const res = await request(app)
        .post('/admin/invoices')
        .set(auth)
        .send({
          restaurant_id: 'restaurant_1',
          amount: 49,
          billing_period_start: '2026-08-01',
          billing_period_end: '2026-08-31',
          description: 'Pro plan — August 2026',
        });

      expect(res.status).toBe(201);
      expect(res.body.invoice.restaurant_id).toBe('restaurant_1');
      expect(res.body.invoice.status).toBe('pending');
      expect(res.body.invoice.invoice_id).toMatch(/^inv_/);
    });

    it('404s for an unknown restaurant', async () => {
      const res = await request(app)
        .post('/admin/invoices')
        .set(auth)
        .send({ restaurant_id: 'nope', amount: 10 });

      expect(res.status).toBe(404);
    });

    it('rejects a negative amount', async () => {
      seedRestaurant();

      const res = await request(app)
        .post('/admin/invoices')
        .set(auth)
        .send({ restaurant_id: 'restaurant_1', amount: -5 });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /:id', () => {
    it('marks an invoice paid and stamps paid_at', async () => {
      seedRestaurant();
      seedInvoice();

      const res = await request(app)
        .patch('/admin/invoices/inv_1')
        .set(auth)
        .send({ status: 'paid' });

      expect(res.status).toBe(200);
      expect(res.body.invoice.status).toBe('paid');
      expect(res.body.invoice.paid_at).toBeTruthy();
    });

    it('rejects an invalid status', async () => {
      seedRestaurant();
      seedInvoice();

      const res = await request(app)
        .patch('/admin/invoices/inv_1')
        .set(auth)
        .send({ status: 'nope' });

      expect(res.status).toBe(400);
    });

    it('404s for an unknown invoice', async () => {
      const res = await request(app)
        .patch('/admin/invoices/nope')
        .set(auth)
        .send({ status: 'paid' });

      expect(res.status).toBe(404);
    });
  });

  describe('attachments', () => {
    it('uploads an attachment and lists it on the invoice', async () => {
      seedRestaurant();
      seedInvoice();

      const upload = await request(app)
        .post('/admin/invoices/inv_1/attachments')
        .set(auth)
        .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

      expect(upload.status).toBe(201);
      expect(upload.body.attachment.file_url).toMatch(/^fake:\/\/upload\//);
      expect(upload.body.attachment.file_name).toBe('invoice.pdf');

      const res = await request(app).get('/admin/invoices/inv_1').set(auth);
      expect(res.status).toBe(200);
      expect(res.body.attachments).toHaveLength(1);
      expect(res.body.attachments[0].attachment_id).toBe(upload.body.attachment.attachment_id);
    });

    it('404s uploading to an unknown invoice', async () => {
      const res = await request(app)
        .post('/admin/invoices/nope/attachments')
        .set(auth)
        .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

      expect(res.status).toBe(404);
    });

    it('rejects a disallowed mime type', async () => {
      seedRestaurant();
      seedInvoice();

      const res = await request(app)
        .post('/admin/invoices/inv_1/attachments')
        .set(auth)
        .attach('file', Buffer.from('bad'), { filename: 'malware.exe', contentType: 'application/x-msdownload' });

      expect(res.status).toBe(400);
    });

    it('deletes an attachment', async () => {
      seedRestaurant();
      seedInvoice();
      fakeDb.seed('admin', 'invoice_attachments', [{
        attachment_id: 'att_1', invoice_id: 'inv_1', file_url: 'fake://upload/old.pdf',
        file_name: 'invoice.pdf', mime_type: 'application/pdf', uploaded_by: 'admin_1',
      }]);
      const deleteSpy = vi.spyOn(fakeDb.adapter, 'deleteFile');

      const res = await request(app)
        .delete('/admin/invoices/inv_1/attachments/att_1')
        .set(auth);

      expect(res.status).toBe(204);
      expect(deleteSpy).toHaveBeenCalledWith('fake://upload/old.pdf');

      const getRes = await request(app).get('/admin/invoices/inv_1').set(auth);
      expect(getRes.body.attachments).toHaveLength(0);
    });
  });

  describe('status history', () => {
    it('records a status_history entry on every PATCH status change', async () => {
      seedRestaurant();
      seedInvoice();

      await request(app).patch('/admin/invoices/inv_1').set(auth).send({ status: 'paid' });

      const res = await request(app).get('/admin/invoices/inv_1').set(auth);
      expect(res.body.statusHistory).toHaveLength(1);
      expect(res.body.statusHistory[0]).toMatchObject({ from_status: 'pending', to_status: 'paid' });
    });

    it('does not record an entry when status is not part of the PATCH', async () => {
      seedRestaurant();
      seedInvoice();

      await request(app).patch('/admin/invoices/inv_1').set(auth).send({ description: 'Renamed' });

      const res = await request(app).get('/admin/invoices/inv_1').set(auth);
      expect(res.body.statusHistory).toHaveLength(0);
    });
  });

  describe('GET /:id commission charges', () => {
    it('includes commission_charges rolled into this invoice', async () => {
      seedRestaurant();
      seedInvoice({ invoice_id: 'inv_1', subscription_id: '' });
      fakeDb.seed('admin', 'commission_charges', [{
        charge_id: 'charge_1', restaurant_id: 'restaurant_1', reservation_id: 'res_1',
        user_id: 'user_1', amount: 5, rate: 0.1, status: 'invoiced', invoice_id: 'inv_1',
      }]);

      const res = await request(app).get('/admin/invoices/inv_1').set(auth);

      expect(res.status).toBe(200);
      expect(res.body.commissionCharges).toHaveLength(1);
      expect(res.body.commissionCharges[0].charge_id).toBe('charge_1');
    });
  });
});

describe('POST /admin/invoices/generate', () => {
  beforeEach(() => fakeDb.reset());

  function seedPlan(overrides: Partial<Record<string, unknown>> = {}) {
    fakeDb.seed('admin', 'plans', [{
      plan_id: 'plan_pro', tier: 'pro', name: 'Pro', price_monthly: 49, price_annual: 490,
      commission_rate_default: 0.05, max_locations: '', features: [], active: true, sort_order: 0,
      ...overrides,
    }]);
  }

  it('generates a subscription invoice for an active subscription past its period end, and advances the period', async () => {
    seedRestaurant();
    seedPlan();
    fakeDb.seed('admin', 'subscriptions', [{
      subscription_id: 'sub_1', restaurant_id: 'restaurant_1', tier: 'pro', status: 'active',
      billing_interval: 'monthly', current_period_start: '2026-07-01', current_period_end: '2026-08-01',
    }]);

    const res = await request(app).post('/admin/invoices/generate').set(auth).send({ type: 'subscription' });

    expect(res.status).toBe(200);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0]).toMatchObject({
      restaurant_id: 'restaurant_1',
      subscription_id: 'sub_1',
      amount: 49,
      billing_period_start: '2026-08-01',
    });

    const list = await request(app).get('/admin/invoices').set(auth);
    expect(list.body.invoices).toHaveLength(1);
  });

  it('is idempotent — calling generate twice does not double-invoice the same period', async () => {
    seedRestaurant();
    seedPlan();
    fakeDb.seed('admin', 'subscriptions', [{
      subscription_id: 'sub_1', restaurant_id: 'restaurant_1', tier: 'pro', status: 'active',
      billing_interval: 'monthly', current_period_start: '2026-07-01', current_period_end: '2026-08-01',
    }]);

    await request(app).post('/admin/invoices/generate').set(auth).send({ type: 'subscription' });
    const second = await request(app).post('/admin/invoices/generate').set(auth).send({ type: 'subscription' });

    // The period was advanced by the first call, so the second call finds nothing due.
    expect(second.body.invoices).toHaveLength(0);
  });

  it('skips a subscription whose period has not ended yet', async () => {
    seedRestaurant();
    seedPlan();
    fakeDb.seed('admin', 'subscriptions', [{
      subscription_id: 'sub_1', restaurant_id: 'restaurant_1', tier: 'pro', status: 'active',
      billing_interval: 'monthly', current_period_start: '2026-08-01', current_period_end: '2099-01-01',
    }]);

    const res = await request(app).post('/admin/invoices/generate').set(auth).send({ type: 'subscription' });

    expect(res.body.invoices).toHaveLength(0);
  });

  it('rolls up pending commission_charges into one invoice per restaurant', async () => {
    seedRestaurant();
    fakeDb.seed('admin', 'commission_charges', [
      { charge_id: 'charge_1', restaurant_id: 'restaurant_1', reservation_id: 'res_1', user_id: 'user_1', amount: 5, rate: 0.1, status: 'pending', invoice_id: '' },
      { charge_id: 'charge_2', restaurant_id: 'restaurant_1', reservation_id: 'res_2', user_id: 'user_1', amount: 7, rate: 0.1, status: 'pending', invoice_id: '' },
    ]);

    const res = await request(app).post('/admin/invoices/generate').set(auth).send({ type: 'commission' });

    expect(res.status).toBe(200);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0].amount).toBe(12);

    const chargesRes = await request(app).get('/admin/invoices/' + (res.body.invoices[0].invoice_id as string)).set(auth);
    expect(chargesRes.body.commissionCharges).toHaveLength(2);
  });
});
