import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminRestaurantsService from '../../services/admin/restaurants.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminRestaurantsService.list({
    status: req.query.status as string | undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await adminRestaurantsService.getById(req.params.id as string);
  res.json({ restaurant });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await adminRestaurantsService.updateStatus(req.params.id as string, req.body);
  res.json({ restaurant });
});
