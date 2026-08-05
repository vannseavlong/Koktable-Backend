import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminServicesService from '../../services/admin/services.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminServicesService.list({
    active:      req.query.active !== undefined ? req.query.active === 'true' : undefined,
    category_id: req.query.category_id as string | undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const service = await adminServicesService.getById(req.params.id as string);
  res.json({ service });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const service = await adminServicesService.create(req.body);
  res.status(201).json({ service });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const service = await adminServicesService.update(req.params.id as string, req.body);
  res.json({ service });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminServicesService.remove(req.params.id as string);
  res.status(204).send();
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminServicesService.reorder(req.body.order);
  res.json(result);
});
