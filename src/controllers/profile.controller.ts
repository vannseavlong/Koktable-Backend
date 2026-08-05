import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as profileService from '../services/profile.service';

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await profileService.getProfile(req.user!);
  res.json({ profile });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const profile = await profileService.updateProfile(req.user!, req.body);
  res.json({ profile });
});
