import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as dashboardService from '../../services/admin/dashboard.service';

export const getOverview = asyncHandler(async (req: Request, res: Response) => {
  const range = dashboardService.parseRange(req.query.range);
  const result = await dashboardService.getOverview(range);
  res.json(result);
});
