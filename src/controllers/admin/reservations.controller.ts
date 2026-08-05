import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminReservationsService from '../../services/admin/reservations.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminReservationsService.list({
    status:  req.query.status as string | undefined,
    restaurant_id: req.query.restaurant_id as string | undefined,
    limit:   req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    offset:  req.query.offset !== undefined ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const reservation = await adminReservationsService.getById(req.params.id as string, req.query.user_id as string);
  res.json({ reservation });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const reservation = await adminReservationsService.updateStatus(
    req.params.id as string,
    req.body.user_id as string,
    req.body.status as string,
  );
  res.json({ reservation });
});
