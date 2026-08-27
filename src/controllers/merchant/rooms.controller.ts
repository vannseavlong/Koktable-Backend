import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import * as merchantRoomsService from '../../services/merchant/rooms.service';

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
  const result = await merchantRoomsService.list(requireRestaurantId(req), {
    location_id: req.query.location_id as string | undefined,
    floor_id:    req.query.floor_id as string | undefined,
    active:      req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const room = await merchantRoomsService.getById(requireRestaurantId(req), req.params.id as string);
  res.json({ room });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const room = await merchantRoomsService.create(requireRestaurantId(req), req.body);
  res.status(201).json({ room });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const room = await merchantRoomsService.update(requireRestaurantId(req), req.params.id as string, req.body);
  res.json({ room });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await merchantRoomsService.remove(requireRestaurantId(req), req.params.id as string);
  res.status(204).send();
});
