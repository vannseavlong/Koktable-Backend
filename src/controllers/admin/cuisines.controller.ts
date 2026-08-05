import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminCuisinesService from '../../services/admin/cuisines.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminCuisinesService.list({
    active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const cuisine = await adminCuisinesService.getById(req.params.id as string);
  res.json({ cuisine });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const cuisine = await adminCuisinesService.create(req.body);
  res.status(201).json({ cuisine });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const cuisine = await adminCuisinesService.update(req.params.id as string, req.body);
  res.json({ cuisine });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminCuisinesService.remove(req.params.id as string);
  res.status(204).send();
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminCuisinesService.reorder(req.body.order);
  res.json(result);
});
