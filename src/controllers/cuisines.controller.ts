import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as cuisinesService from '../services/cuisines.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const result = await cuisinesService.list();
  res.json(result);
});
