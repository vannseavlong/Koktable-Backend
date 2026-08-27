import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminTablesService from '../../services/admin/tables.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminTablesService.list({
    restaurant_id: req.query.restaurant_id as string | undefined,
    location_id:   req.query.location_id as string | undefined,
    room_id:       req.query.room_id as string | undefined,
    active:        req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const table = await adminTablesService.getById(req.params.id as string);
  res.json({ table });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const table = await adminTablesService.create(req.body);
  res.status(201).json({ table });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const table = await adminTablesService.update(req.params.id as string, req.body);
  res.json({ table });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminTablesService.remove(req.params.id as string);
  res.status(204).send();
});
