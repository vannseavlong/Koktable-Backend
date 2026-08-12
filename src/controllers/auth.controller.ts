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

export const logout = asyncHandler(async (req: Request, res: Response) => {
  // requireAuth already validated the shape of this header before this handler runs.
  const token = req.headers.authorization!.slice(7);
  await authService.logout(token, req.user!);
  res.status(204).send();
});
