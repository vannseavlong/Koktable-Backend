import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminRoomsService from '../../services/admin/rooms.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminRoomsService.list({
    restaurant_id: req.query.restaurant_id as string | undefined,
    location_id:   req.query.location_id as string | undefined,
    floor_id:      req.query.floor_id as string | undefined,
    active:        req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const room = await adminRoomsService.getById(req.params.id as string);
  res.json({ room });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const room = await adminRoomsService.create(req.body);
  res.status(201).json({ room });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const room = await adminRoomsService.update(req.params.id as string, req.body);
  res.json({ room });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminRoomsService.remove(req.params.id as string);
  res.status(204).send();
});
