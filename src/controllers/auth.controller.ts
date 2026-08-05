import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as authService from '../services/auth.service';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { token, user } = await authService.register(req.body);
  res.status(201).json({ token, user });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { token, user } = await authService.login(req.body);
  res.json({ token, user });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getMe(req.user!.user_id);
  res.json({ user });
});
