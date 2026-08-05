import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as catalogItemsService from '../services/catalogItems.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await catalogItemsService.list({
    type:  req.query.type as string | undefined,
    limit: req.query.limit as string | undefined,
  });
  res.json(result);
});
