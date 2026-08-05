import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as merchantService from '../services/merchant.service';

export const apply = asyncHandler(async (req: Request, res: Response) => {
  const application = await merchantService.apply(req.body);
  res.status(201).json({ application });
});

export const getInvite = asyncHandler(async (req: Request, res: Response) => {
  const invite = await merchantService.getInvite(req.params.token as string);
  res.json(invite);
});

export const acceptInvite = asyncHandler(async (req: Request, res: Response) => {
  const result = await merchantService.acceptInvite(req.params.token as string, req.body);
  res.json(result);
});
