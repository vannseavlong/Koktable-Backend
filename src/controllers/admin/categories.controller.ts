import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminCategoriesService from '../../services/admin/categories.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminCategoriesService.list({
    active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const category = await adminCategoriesService.getById(req.params.id as string);
  res.json({ category });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const category = await adminCategoriesService.create(req.body);
  res.status(201).json({ category });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const category = await adminCategoriesService.update(req.params.id as string, req.body);
  res.json({ category });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminCategoriesService.remove(req.params.id as string);
  res.status(204).send();
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminCategoriesService.reorder(req.body.order);
  res.json(result);
});
