import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import * as merchantRestaurantService from '../../services/merchant/restaurant.service';
import { uploadImage, deleteImageBestEffort } from '../../utils/imageUpload';

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

export const getOwn = asyncHandler(async (req: Request, res: Response) => {
  const restaurant = await merchantRestaurantService.getOwn(requireRestaurantId(req));
  res.json({ restaurant });
});

// Logo/banner arrive as multipart files (see routes/merchant/restaurant.routes.ts's
// upload.fields([...])); an explicit empty-string field (no file attached) means
// "clear this image" from the edit dialog's remove button.
export const updateOwn = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = requireRestaurantId(req);
  const body: Record<string, unknown> = { ...req.body };

  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const logoFile = files?.logo?.[0];
  const bannerFile = files?.banner?.[0];
  const clearingLogo = !logoFile && body.logo === '';
  const clearingBanner = !bannerFile && body.banner === '';

  if (logoFile || bannerFile || clearingLogo || clearingBanner) {
    const current = await merchantRestaurantService.getOwn(restaurantId);

    if (logoFile) {
      body.logo = await uploadImage(logoFile);
      await deleteImageBestEffort(current.logo as string | undefined);
    } else if (clearingLogo) {
      await deleteImageBestEffort(current.logo as string | undefined);
    }

    if (bannerFile) {
      body.banner = await uploadImage(bannerFile);
      await deleteImageBestEffort(current.banner as string | undefined);
    } else if (clearingBanner) {
      await deleteImageBestEffort(current.banner as string | undefined);
    }
  }

  const restaurant = await merchantRestaurantService.updateOwn(restaurantId, body);
  res.json({ restaurant });
});
