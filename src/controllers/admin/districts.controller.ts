import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminDistrictsService from '../../services/admin/districts.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { active, city_id } = req.query;
  const result = await adminDistrictsService.list({
    active:  active  !== undefined ? active === 'true' : undefined,
    city_id: typeof city_id === 'string' && city_id.length > 0 ? city_id : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const district = await adminDistrictsService.getById(req.params.id as string);
  res.json({ district });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const district = await adminDistrictsService.create(req.body);
  res.status(201).json({ district });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const district = await adminDistrictsService.update(req.params.id as string, req.body);
  res.json({ district });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminDistrictsService.remove(req.params.id as string);
  res.status(204).send();
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminDistrictsService.reorder(req.body.order);
  res.json(result);
});
