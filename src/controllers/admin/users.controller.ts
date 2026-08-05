import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as adminUsersService from '../../services/admin/users.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await adminUsersService.list({
    status: req.query.status as string | undefined,
    role:   req.query.role as string | undefined,
    search: req.query.search as string | undefined,
    limit:  req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminUsersService.getById(req.params.id as string);
  res.json({ user });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = await adminUsersService.updateStatus(req.params.id as string, req.body);
  res.json({ user });
});
