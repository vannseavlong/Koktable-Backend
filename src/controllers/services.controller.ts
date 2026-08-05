import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as servicesService from '../services/services.service';

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const services = await servicesService.list();
  res.json({ services });
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const service = await servicesService.getById(req.params.id as string);
  res.json({ service });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const service = await servicesService.create(req.body);
  res.status(201).json({ service });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const service = await servicesService.update(req.params.id as string, req.body);
  res.json({ service });
});

export const deactivate = asyncHandler(async (req: Request, res: Response) => {
  await servicesService.deactivate(req.params.id as string);
  res.json({ message: 'Service deactivated' });
});
