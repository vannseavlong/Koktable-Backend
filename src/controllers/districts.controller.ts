import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as districtsService from '../services/districts.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { city_id } = req.query;
  const result = await districtsService.list({
    city_id: typeof city_id === 'string' && city_id.length > 0 ? city_id : undefined,
  });
  res.json(result);
});
