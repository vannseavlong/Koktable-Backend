import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import * as merchantCatalogItemsService from '../../services/merchant/catalogItems.service';
import { uploadImage } from '../../utils/imageUpload';

// requireMerchant (middleware/auth.ts) guarantees req.user.role === 'merchant', but
// restaurant_id is only populated once the invite/login resolves an owned restaurant (see
// resolveMerchantRestaurantId in auth.service.ts) — guard defensively rather than trust it.
function requireRestaurantId(req: Request): string {
  const restaurantId = req.user?.restaurant_id;
  if (!restaurantId) {
    throw new AppError(422, 'Merchant account has no associated restaurant.');
  }
  return restaurantId;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await merchantCatalogItemsService.list(requireRestaurantId(req), {
    item_type: req.query.item_type as string | undefined,
    active:    req.query.active !== undefined ? req.query.active === 'true' : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const item = await merchantCatalogItemsService.getById(requireRestaurantId(req), req.params.id as string);
  res.json({ item });
});

// Multipart requests (the My Products feature) send every field as a string —
// coerce `active` back to a real boolean before it reaches the service. JSON
// requests (My Catalog, no image field) already send a real boolean and pass
// through unchanged.
function coerceBody(raw: Record<string, unknown>): Record<string, unknown> {
  const body = { ...raw };
  if (typeof body.active === 'string') body.active = body.active === 'true';
  return body;
}

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = coerceBody(req.body);
  if (req.file) {
    body.image = await uploadImage(req.file);
  }
  const item = await merchantCatalogItemsService.create(requireRestaurantId(req), body);
  res.status(201).json({ item });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const body = coerceBody(req.body);
  if (req.file) {
    body.image = await uploadImage(req.file);
  }
  const item = await merchantCatalogItemsService.update(requireRestaurantId(req), req.params.id as string, body);
  res.json({ item });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await merchantCatalogItemsService.remove(requireRestaurantId(req), req.params.id as string);
  res.status(204).send();
});
