import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as reservationForwardsService from '../../services/admin/reservationForwards.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await reservationForwardsService.list(req.params.id as string);
  res.json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const forward = await reservationForwardsService.create(
    req.params.id as string,
    req.user!.user_id,
    req.body,
  );
  res.status(201).json({ forward });
});
