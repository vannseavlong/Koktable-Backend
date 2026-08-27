import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import * as merchantFloorsService from '../../services/merchant/floors.service';

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
  const result = await merchantFloorsService.list(requireRestaurantId(req), {
    location_id: req.query.location_id as string | undefined,
    active:      req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const floor = await merchantFloorsService.getById(requireRestaurantId(req), req.params.id as string);
  res.json({ floor });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const floor = await merchantFloorsService.create(requireRestaurantId(req), req.body);
  res.status(201).json({ floor });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const floor = await merchantFloorsService.update(requireRestaurantId(req), req.params.id as string, req.body);
  res.json({ floor });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await merchantFloorsService.remove(requireRestaurantId(req), req.params.id as string);
  res.status(204).send();
});
