import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as subscriptionsService from '../../services/admin/subscriptions.service';

export const get = asyncHandler(async (req: Request, res: Response) => {
  const subscription = await subscriptionsService.ensureForRestaurant(req.params.id as string);
  res.json({ subscription });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const subscription = await subscriptionsService.setForRestaurant(req.params.id as string, req.body);
  res.json({ subscription });
});
