import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as categoriesService from '../services/categories.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const result = await categoriesService.list();
  res.json(result);
});
