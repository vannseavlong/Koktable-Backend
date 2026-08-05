import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminCatalogItemsService from '../../services/admin/catalogItems.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminCatalogItemsService.list({
    restaurant_id:   req.query.restaurant_id as string | undefined,
    item_type: req.query.item_type as string | undefined,
    active:    req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const item = await adminCatalogItemsService.getById(req.params.id as string);
  res.json({ item });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const item = await adminCatalogItemsService.create(req.body);
  res.status(201).json({ item });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const item = await adminCatalogItemsService.update(req.params.id as string, req.body);
  res.json({ item });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await adminCatalogItemsService.remove(req.params.id as string);
  res.status(204).send();
});
