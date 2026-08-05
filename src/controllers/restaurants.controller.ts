import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as restaurantsService from '../services/restaurants.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const result = await restaurantsService.list();
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const result = await restaurantsService.getById(req.params.id as string);
  res.json(result);
});

export const listCatalogItems = asyncHandler(async (req: Request, res: Response) => {
  const result = await restaurantsService.listCatalogItems(req.params.id as string);
  res.json(result);
});
