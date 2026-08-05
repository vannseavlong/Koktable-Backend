import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as reservationsService from '../services/reservations.service';

export const create = asyncHandler(async (req: Request, res: Response) => {
  const reservation = await reservationsService.create(req.user!, req.body);
  res.status(201).json({ reservation });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await reservationsService.list(req.user!, {
    status: req.query.status as string | undefined,
    limit:  req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

export const listActive = asyncHandler(async (req: Request, res: Response) => {
  const result = await reservationsService.listActive(req.user!);
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const reservation = await reservationsService.getById(req.user!, req.params.id as string);
  res.json({ reservation });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const reservation = await reservationsService.update(req.user!, req.params.id as string, req.body);
  res.json({ reservation });
});
