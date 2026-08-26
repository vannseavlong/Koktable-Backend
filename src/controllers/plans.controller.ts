import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as plansService from '../services/plans.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const result = await plansService.list();
  res.json(result);
});
