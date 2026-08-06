import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminCitiesService from '../../services/admin/cities.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminCitiesService.list({
    active: req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const city = await adminCitiesService.getById(req.params.id as string);
  res.json({ city });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const city = await adminCitiesService.create(req.body);
  res.status(201).json({ city });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const city = await adminCitiesService.update(req.params.id as string, req.body);
  res.json({ city });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminCitiesService.remove(req.params.id as string);
  res.status(204).send();
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminCitiesService.reorder(req.body.order);
  res.json(result);
});
