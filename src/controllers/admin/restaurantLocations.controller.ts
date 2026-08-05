import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminRestaurantLocationsService from '../../services/admin/restaurantLocations.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const location = await adminRestaurantLocationsService.create(req.params.id as string, req.body);
  res.status(201).json({ location });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const location = await adminRestaurantLocationsService.update(
    req.params.id as string,
    req.params.locationId as string,
    req.body
  );
  res.json({ location });
});
