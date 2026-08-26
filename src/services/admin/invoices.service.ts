import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';
import { deleteFileBestEffort } from '../../utils/fileUpload';
import * as plansService from './plans.service';

export type InvoiceStatus = 'pending' | 'submitted' | 'paid' | 'failed' | 'refunded';

export interface Invoice {
  invoice_id: string;
  restaurant_id: string;
  subscription_id?: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  billing_period_start?: string;
  billing_period_end?: string;
  due_date?: string;
  paid_at?: string;
  description?: string;
}

export interface InvoiceAttachment {
  attachment_id: string;
  invoice_id: string;
  file_url: string;
  file_name: string;
  mime_type: string;
  uploaded_by: string;
  kind: 'invoice' | 'receipt';
}

export interface InvoiceStatusHistoryEntry {
  history_id: string;
  invoice_id: string;
  from_status: string;
  to_status: string;
  changed_by: string;
  changed_at: string;
}

interface ListInvoicesQuery {
  restaurant_id?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface CreateInvoiceInput {
  restaurant_id: string;
  subscription_id?: string;
  amount: number;
  currency?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  due_date?: string;
  description?: string;
}

interface UpdateInvoiceInput {
  status?: string;
  amount?: number;
  due_date?: string;
  paid_at?: string;
  description?: string;
}

const VALID_STATUSES = ['pending', 'submitted', 'paid', 'failed', 'refunded'] as const;

function toInvoice(row: Record<string, unknown>): Invoice {
  return row as unknown as Invoice;
}

function toAttachment(row: Record<string, unknown>): InvoiceAttachment {
  return row as unknown as InvoiceAttachment;
}

function toHistoryEntry(row: Record<string, unknown>): InvoiceStatusHistoryEntry {
  return row as unknown as InvoiceStatusHistoryEntry;
}

export async function list(query: ListInvoicesQuery) {
  const ctx = adminContext();
  const limit  = Math.min(query.limit ?? 50, 100);
  const offset = query.offset ?? 0;

  const where: Record<string, unknown> = {};
  if (query.restaurant_id) where.restaurant_id = query.restaurant_id;
  if (query.status)        where.status        = query.status;

  const rows = await ctx.table('invoices').findMany({ where, orderBy: '_created_at', order: 'desc' }) as Record<string, unknown>[];
  const invoices = rows.map(toInvoice);

  const total = invoices.length;
  const page  = invoices.slice(offset, offset + limit);

  return { invoices: page, total, limit, offset };
}

export async function getById(id: string): Promise<{
  invoice: Invoice;
  attachments: InvoiceAttachment[];
  statusHistory: InvoiceStatusHistoryEntry[];
  commissionCharges: Record<string, unknown>[];
}> {
  const ctx = adminContext();
  const row = await ctx.table('invoices').findOne({ where: { invoice_id: id } }) as Record<string, unknown> | null;
  if (!row) {
    throw new AppError(404, 'Invoice not found');
  }

  const [attachmentRows, historyRows, chargeRows] = await Promise.all([
    ctx.table('invoice_attachments').findMany({ where: { invoice_id: id } }) as Promise<Record<string, unknown>[]>,
    ctx.table('invoice_status_history').findMany({ where: { invoice_id: id }, orderBy: 'changed_at', order: 'asc' }) as Promise<Record<string, unknown>[]>,
    ctx.table('commission_charges').findMany({ where: { invoice_id: id } }) as Promise<Record<string, unknown>[]>,
  ]);

  return {
    invoice: toInvoice(row),
    attachments: attachmentRows.map(toAttachment),
    statusHistory: historyRows.map(toHistoryEntry),
    commissionCharges: chargeRows,
  };
}

// Batched read for the attachment count/preview a list view wants without an N+1 —
// same shape as subscriptions.service.ts's getForRestaurants.
export async function getAttachmentsForInvoices(invoiceIds: string[]): Promise<Map<string, InvoiceAttachment[]>> {
  const ctx = adminContext();
  const all = await ctx.table('invoice_attachments').findMany({}) as Record<string, unknown>[];
  const ids = new Set(invoiceIds);
  const byInvoice = new Map<string, InvoiceAttachment[]>();
  for (const row of all) {
    const invoiceId = row.invoice_id as string;
    if (!ids.has(invoiceId)) continue;
    const attachment = toAttachment(row);
    const existing = byInvoice.get(invoiceId) ?? [];
    existing.push(attachment);
    byInvoice.set(invoiceId, existing);
  }
  return byInvoice;
}

export async function create(input: CreateInvoiceInput): Promise<Invoice> {
  if (!input.restaurant_id) {
    throw new AppError(400, 'restaurant_id is required');
  }
  if (input.amount === undefined || input.amount < 0) {
    throw new AppError(400, 'amount must be a non-negative number');
  }

  const ctx = adminContext();
  const restaurant = await ctx.table('restaurants').findOne({ where: { restaurant_id: input.restaurant_id } });
  if (!restaurant) {
    throw new AppError(404, 'Restaurant not found');
  }

  const invoice_id = `inv_${nanoid(10)}`;
  await ctx.table('invoices').create({
    invoice_id,
    restaurant_id:         input.restaurant_id,
    subscription_id:       input.subscription_id,
    amount:                input.amount,
    currency:               input.currency ?? 'USD',
    status:                 'pending',
    billing_period_start:  input.billing_period_start,
    billing_period_end:    input.billing_period_end,
    due_date:              input.due_date,
    description:           input.description,
  });

  const row = await ctx.table('invoices').findOne({ where: { invoice_id } }) as Record<string, unknown>;
  return toInvoice(row);
}

// Shared by the admin PATCH and the merchant receipt-upload auto-transition (invoices
// controller/merchant restaurant.service.ts) so both paths get the same status-history
// audit trail — a transition never happens silently.
async function transitionStatus(
  ctx: ReturnType<typeof adminContext>,
  invoiceId: string,
  fromStatus: string,
  toStatus: string,
  changedBy: string
): Promise<void> {
  if (fromStatus === toStatus) return;
  await ctx.table('invoice_status_history').create({
    history_id:  `ish_${nanoid(10)}`,
    invoice_id:  invoiceId,
    from_status: fromStatus,
    to_status:   toStatus,
    changed_by:  changedBy,
    changed_at:  new Date().toISOString(),
  });
}

export async function update(id: string, input: UpdateInvoiceInput, changedBy: string): Promise<Invoice> {
  const ctx = adminContext();
  const existing = await ctx.table('invoices').findOne({ where: { invoice_id: id } }) as Record<string, unknown> | null;
  if (!existing) {
    throw new AppError(404, 'Invoice not found');
  }

  if (input.status !== undefined && !VALID_STATUSES.includes(input.status as typeof VALID_STATUSES[number])) {
    throw new AppError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (input.amount !== undefined && input.amount < 0) {
    throw new AppError(400, 'amount must be a non-negative number');
  }

  const data: Record<string, unknown> = {};
  if (input.status !== undefined)      data.status = input.status;
  if (input.amount !== undefined)      data.amount = input.amount;
  if (input.due_date !== undefined)    data.due_date = input.due_date;
  if (input.paid_at !== undefined)     data.paid_at = input.paid_at;
  if (input.description !== undefined) data.description = input.description;
  // Marking paid without an explicit paid_at stamps "now" — the common case (admin
  // just clicks "Mark paid") shouldn't require a second field.
  if (input.status === 'paid' && input.paid_at === undefined) {
    data.paid_at = new Date().toISOString();
  }

  await ctx.table('invoices').update({ where: { invoice_id: id }, data });

  if (input.status !== undefined) {
    await transitionStatus(ctx, id, existing.status as string, input.status, changedBy);
  }

  const row = await ctx.table('invoices').findOne({ where: { invoice_id: id } }) as Record<string, unknown>;
  return toInvoice(row);
}

export async function addAttachment(
  invoiceId: string,
  file: { file_url: string; file_name: string; mime_type: string },
  uploadedBy: string,
  kind: 'invoice' | 'receipt' = 'invoice'
): Promise<InvoiceAttachment> {
  const ctx = adminContext();
  const invoice = await ctx.table('invoices').findOne({ where: { invoice_id: invoiceId } });
  if (!invoice) {
    throw new AppError(404, 'Invoice not found');
  }

  const attachment_id = `att_${nanoid(10)}`;
  await ctx.table('invoice_attachments').create({
    attachment_id,
    invoice_id:  invoiceId,
    file_url:    file.file_url,
    file_name:   file.file_name,
    mime_type:   file.mime_type,
    uploaded_by: uploadedBy,
    kind,
  });

  // A merchant attaching a receipt is a claim of payment — move the bill out of
  // pending/failed into 'submitted' so it surfaces for admin confirmation instead of
  // silently sitting there with an attachment nobody's told to look at. An admin
  // attaching the invoice document itself (kind: 'invoice') doesn't change status.
  if (kind === 'receipt') {
    const current = (invoice as Record<string, unknown>).status as string;
    if (current === 'pending' || current === 'failed') {
      await ctx.table('invoices').update({ where: { invoice_id: invoiceId }, data: { status: 'submitted' } });
      await transitionStatus(ctx, invoiceId, current, 'submitted', uploadedBy);
    }
  }

  const row = await ctx.table('invoice_attachments').findOne({ where: { attachment_id } }) as Record<string, unknown>;
  return toAttachment(row);
}

export async function deleteAttachment(invoiceId: string, attachmentId: string): Promise<void> {
  const ctx = adminContext();
  const attachment = await ctx.table('invoice_attachments').findOne({
    where: { attachment_id: attachmentId, invoice_id: invoiceId },
  }) as Record<string, unknown> | null;
  if (!attachment) {
    throw new AppError(404, 'Attachment not found');
  }

  await ctx.table('invoice_attachments').delete({ where: { attachment_id: attachmentId } });
  await deleteFileBestEffort(attachment.file_url as string | undefined);
}

// ---------------------------------------------------------------------------
// Automated invoice generation — POST /admin/invoices/generate. No job scheduler
// exists in this repo (see Backend/CLAUDE.md); this is designed to be safe to call
// either by hand (an admin "Run billing" button) or from an external cron (Render
// Cron Job / GitHub Actions) hitting the same endpoint on a schedule.
// ---------------------------------------------------------------------------

function addInterval(date: Date, interval: 'monthly' | 'annual'): Date {
  const next = new Date(date);
  if (interval === 'annual') {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

function periodLabel(start: Date, interval: 'monthly' | 'annual'): string {
  return interval === 'annual'
    ? start.getUTCFullYear().toString()
    : start.toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' });
}

// One invoice per subscription whose current period has ended (or never started).
// Idempotent: skips a subscription that already has an invoice for the same
// billing_period_start, so calling this twice in a row (or a cron overlapping a
// manual click) never double-bills.
async function generateSubscriptionInvoices(ctx: ReturnType<typeof adminContext>, now: Date): Promise<Invoice[]> {
  const subscriptions = await ctx.table('subscriptions').findMany({ where: { status: 'active' } }) as Record<string, unknown>[];
  const created: Invoice[] = [];

  for (const sub of subscriptions) {
    const restaurantId = sub.restaurant_id as string;
    const interval = (sub.billing_interval as 'monthly' | 'annual') ?? 'monthly';
    const currentEnd = sub.current_period_end ? new Date(sub.current_period_end as string) : null;
    if (currentEnd && currentEnd.getTime() > now.getTime()) continue; // period still running

    const periodStart = currentEnd ?? (sub.current_period_start ? new Date(sub.current_period_start as string) : now);
    const periodEnd = addInterval(periodStart, interval);
    const periodStartIso = periodStart.toISOString().slice(0, 10);

    const alreadyInvoiced = await ctx.table('invoices').findOne({
      where: { subscription_id: sub.subscription_id, billing_period_start: periodStartIso },
    });
    if (alreadyInvoiced) continue;

    const plan = await plansService.getByTier(sub.tier as string);
    const amount = interval === 'annual' ? plan.price_annual as number : plan.price_monthly as number;

    const invoice_id = `inv_${nanoid(10)}`;
    await ctx.table('invoices').create({
      invoice_id,
      restaurant_id:        restaurantId,
      subscription_id:      sub.subscription_id,
      amount,
      currency:              'USD',
      status:                'pending',
      billing_period_start: periodStartIso,
      billing_period_end:   periodEnd.toISOString().slice(0, 10),
      due_date:             periodEnd.toISOString().slice(0, 10),
      description:          `${plan.name as string} plan — ${periodLabel(periodStart, interval)}`,
    });

    await ctx.table('subscriptions').update({
      where: { subscription_id: sub.subscription_id },
      data:  { current_period_start: periodStartIso, current_period_end: periodEnd.toISOString().slice(0, 10) },
    });

    const row = await ctx.table('invoices').findOne({ where: { invoice_id } }) as Record<string, unknown>;
    created.push(toInvoice(row));
  }

  return created;
}

// One invoice per restaurant with any 'pending' commission_charges row — rolls every
// pending charge for that restaurant into a single invoice and marks them 'invoiced'.
// Settlement period is simply "now" (the month the job runs), since commission_charges
// itself carries no billing-period field — see schemas/admin/commission_charges.ts.
async function generateCommissionInvoices(ctx: ReturnType<typeof adminContext>, now: Date): Promise<Invoice[]> {
  const pending = await ctx.table('commission_charges').findMany({ where: { status: 'pending' } }) as Record<string, unknown>[];
  const byRestaurant = new Map<string, Record<string, unknown>[]>();
  for (const charge of pending) {
    const restaurantId = charge.restaurant_id as string;
    const existing = byRestaurant.get(restaurantId) ?? [];
    existing.push(charge);
    byRestaurant.set(restaurantId, existing);
  }

  const created: Invoice[] = [];
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  for (const [restaurantId, charges] of byRestaurant) {
    const amount = charges.reduce((sum, c) => sum + (c.amount as number), 0);
    if (amount <= 0) continue;

    const invoice_id = `inv_${nanoid(10)}`;
    await ctx.table('invoices').create({
      invoice_id,
      restaurant_id:        restaurantId,
      amount,
      currency:              'USD',
      status:                'pending',
      billing_period_start: periodStart.toISOString().slice(0, 10),
      billing_period_end:   periodEnd.toISOString().slice(0, 10),
      due_date:             periodEnd.toISOString().slice(0, 10),
      description:          `Commission — ${charges.length} booking${charges.length === 1 ? '' : 's'}`,
    });

    await Promise.all(
      charges.map((c) =>
        ctx.table('commission_charges').update({
          where: { charge_id: c.charge_id },
          data:  { status: 'invoiced', invoice_id },
        })
      )
    );

    const row = await ctx.table('invoices').findOne({ where: { invoice_id } }) as Record<string, unknown>;
    created.push(toInvoice(row));
  }

  return created;
}

export async function generateDueInvoices(type: 'subscription' | 'commission' | 'all' = 'all'): Promise<Invoice[]> {
  const ctx = adminContext();
  const now = new Date();

  const results: Invoice[] = [];
  if (type === 'subscription' || type === 'all') {
    results.push(...await generateSubscriptionInvoices(ctx, now));
  }
  if (type === 'commission' || type === 'all') {
    results.push(...await generateCommissionInvoices(ctx, now));
  }
  return results;
}
