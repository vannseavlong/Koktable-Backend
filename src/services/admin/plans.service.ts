import { nanoid } from 'nanoid';
import { adminContext } from '../../lib/adapter';
import { AppError } from '../../utils/AppError';

const VALID_TIERS = ['basic', 'pro'] as const;

interface PlanInput {
  tier?: 'basic' | 'pro';
  name?: string;
  price_monthly?: number;
  price_annual?: number;
  commission_rate_default?: number;
  max_locations?: number;
  features?: string[];
  active?: boolean;
  sort_order?: number;
}

function validateCreate(body: PlanInput): string | null {
  if (!body.tier || !VALID_TIERS.includes(body.tier)) return `tier must be one of: ${VALID_TIERS.join(', ')}`;
  if (!body.name) return 'name is required';
  if (body.price_monthly === undefined || body.price_monthly < 0) return 'price_monthly must be a non-negative number';
  if (body.price_annual === undefined || body.price_annual < 0) return 'price_annual must be a non-negative number';
  return null;
}

export async function list() {
  const ctx = adminContext();
  const plans = await ctx.table('plans').findMany({ orderBy: 'sort_order', order: 'asc' });
  return { plans };
}

export async function getById(id: string) {
  const ctx  = adminContext();
  const plan = await ctx.table('plans').findOne({ where: { plan_id: id } });
  if (!plan) {
    throw new AppError(404, 'Plan not found');
  }
  return plan;
}

// Used by invoices.service.ts's generateDueInvoices() to price a subscription's next
// invoice — one active row per tier is the expected shape, but this returns the first
// match rather than assuming uniqueness is enforced everywhere the fake test adapter is used.
export async function getByTier(tier: string) {
  const ctx  = adminContext();
  const plan = await ctx.table('plans').findOne({ where: { tier } });
  if (!plan) {
    throw new AppError(404, `No plan configured for tier "${tier}"`);
  }
  return plan;
}

export async function create(body: PlanInput) {
  const error = validateCreate(body);
  if (error) {
    throw new AppError(400, error);
  }

  const ctx = adminContext();
  const existing = await ctx.table('plans').findOne({ where: { tier: body.tier } });
  if (existing) {
    throw new AppError(409, `A plan for tier "${body.tier as string}" already exists`);
  }

  const plan_id = `plan_${nanoid(10)}`;
  await ctx.table('plans').create({
    plan_id,
    tier:                     body.tier,
    name:                     body.name,
    price_monthly:            body.price_monthly,
    price_annual:             body.price_annual,
    commission_rate_default: body.commission_rate_default,
    max_locations:            body.max_locations,
    features:                 body.features ?? [],
    active:                   body.active ?? true,
    sort_order:               body.sort_order ?? 0,
  });

  return getById(plan_id);
}

export async function update(id: string, body: PlanInput) {
  const ctx = adminContext();
  const existing = await ctx.table('plans').findOne({ where: { plan_id: id } });
  if (!existing) {
    throw new AppError(404, 'Plan not found');
  }

  if (body.price_monthly !== undefined && body.price_monthly < 0) {
    throw new AppError(400, 'price_monthly must be a non-negative number');
  }
  if (body.price_annual !== undefined && body.price_annual < 0) {
    throw new AppError(400, 'price_annual must be a non-negative number');
  }

  const data: Record<string, unknown> = {};
  if (body.name                     !== undefined) data.name = body.name;
  if (body.price_monthly            !== undefined) data.price_monthly = body.price_monthly;
  if (body.price_annual             !== undefined) data.price_annual = body.price_annual;
  if (body.commission_rate_default  !== undefined) data.commission_rate_default = body.commission_rate_default;
  if (body.max_locations            !== undefined) data.max_locations = body.max_locations;
  if (body.features                 !== undefined) data.features = body.features;
  if (body.active                   !== undefined) data.active = body.active;
  if (body.sort_order               !== undefined) data.sort_order = body.sort_order;
  // tier is not updatable — it's the identity a subscription's `tier` column joins
  // against; changing it here would silently re-point every subscription on this plan.

  if (Object.keys(data).length === 0) {
    throw new AppError(400, 'No updatable fields provided');
  }

  await ctx.table('plans').update({ where: { plan_id: id }, data });
  return getById(id);
}
