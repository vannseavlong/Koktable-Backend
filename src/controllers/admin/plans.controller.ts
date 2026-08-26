import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as plansService from '../../services/admin/plans.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const result = await plansService.list();
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const plan = await plansService.getById(req.params.id as string);
  res.json({ plan });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const plan = await plansService.create(req.body);
  res.status(201).json({ plan });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const plan = await plansService.update(req.params.id as string, req.body);
  res.json({ plan });
});
