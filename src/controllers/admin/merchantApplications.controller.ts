import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as merchantApplicationsService from '../../services/admin/merchantApplications.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await merchantApplicationsService.list({
    status: req.query.status as string | undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const application = await merchantApplicationsService.getById(req.params.id as string);
  res.json({ application });
});

export const approve = asyncHandler(async (req: Request, res: Response) => {
  const result = await merchantApplicationsService.approve(req.params.id as string);
  res.json(result);
});

export const resendInvite = asyncHandler(async (req: Request, res: Response) => {
  const result = await merchantApplicationsService.resendInvite(req.params.id as string);
  res.json(result);
});

export const reject = asyncHandler(async (req: Request, res: Response) => {
  const application = await merchantApplicationsService.reject(req.params.id as string, req.body?.reason);
  res.json({ application });
});
