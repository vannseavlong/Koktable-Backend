import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import * as merchantOrdersService from '../../services/merchant/orders.service';

// requireMerchant (middleware/auth.ts) guarantees req.user.role === 'merchant', but
// restaurant_id is only populated once the invite/login resolves an owned restaurant (see
// resolveMerchantRestaurantId in auth.service.ts) — guard defensively rather than trust it.
function requireRestaurantId(req: Request): string {
  const restaurantId = req.user?.restaurant_id;
  if (!restaurantId) {
    throw new AppError(422, 'Merchant account has no associated restaurant.');
  }
  return restaurantId;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await merchantOrdersService.list(requireRestaurantId(req), {
    status: req.query.status as string | undefined,
    limit:  req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const order = await merchantOrdersService.getById(
    requireRestaurantId(req),
    req.params.id as string,
    req.query.user_id as string,
  );
  res.json({ order });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const order = await merchantOrdersService.updateStatus(
    requireRestaurantId(req),
    req.params.id as string,
    req.body.user_id as string,
    req.body.status as string,
  );
  res.json({ order });
});
