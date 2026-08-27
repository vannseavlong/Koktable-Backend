import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminFloorsService from '../../services/admin/floors.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminFloorsService.list({
    restaurant_id: req.query.restaurant_id as string | undefined,
    location_id:   req.query.location_id as string | undefined,
    active:        req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const floor = await adminFloorsService.getById(req.params.id as string);
  res.json({ floor });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const floor = await adminFloorsService.create(req.body);
  res.status(201).json({ floor });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const floor = await adminFloorsService.update(req.params.id as string, req.body);
  res.json({ floor });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminFloorsService.remove(req.params.id as string);
  res.status(204).send();
});
