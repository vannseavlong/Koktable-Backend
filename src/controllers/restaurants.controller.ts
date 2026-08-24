import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as restaurantsService from '../services/restaurants.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { city_id, district_id, cuisine_id, q, limit, offset } = req.query;
  const result = await restaurantsService.list({
    city_id:     typeof city_id === 'string' && city_id.length > 0 ? city_id : undefined,
    district_id: typeof district_id === 'string' && district_id.length > 0 ? district_id : undefined,
    cuisine_id:  typeof cuisine_id === 'string' && cuisine_id.length > 0 ? cuisine_id : undefined,
    q:           typeof q === 'string' && q.length > 0 ? q : undefined,
    limit:  limit !== undefined && limit !== '' ? Number(limit) : undefined,
    offset: offset !== undefined && offset !== '' ? Number(offset) : undefined,
  });
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
