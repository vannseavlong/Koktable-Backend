import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as citiesService from '../services/cities.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const result = await citiesService.list();
  res.json(result);
});
