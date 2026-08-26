import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import * as merchantRestaurantService from '../../services/merchant/restaurant.service';
import { uploadImage, deleteImageBestEffort } from '../../utils/imageUpload';
import { uploadFile } from '../../utils/fileUpload';

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

// The edit dialog always submits multipart/form-data (see restaurant-edit-dialog.tsx),
// so `amenities` arrives as a JSON-encoded string field, not a real array — decode it
// before it reaches the service. A plain-JSON caller (none today, but same convention
// as catalogItems.controller.ts's coerceBody) that already sends a real array passes
// through unchanged.
function coerceAmenities(body: Record<string, unknown>): Record<string, unknown> {
  if (typeof body.amenities !== 'string') return body;
  try {
    return { ...body, amenities: JSON.parse(body.amenities) };
  } catch {
    throw new AppError(400, 'amenities must be a JSON array of strings');
  }
}

// Logo/banner arrive as multipart files (see routes/merchant/restaurant.routes.ts's
// upload.fields([...])); an explicit empty-string field (no file attached) means
// "clear this image" from the edit dialog's remove button.
export const updateOwn = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = requireRestaurantId(req);
  const body: Record<string, unknown> = coerceAmenities({ ...req.body });

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

// Bulk replace-all: body is `{ days: DayHoursInput[] }`. updateOwnHours() resolves this
// restaurant's primary location and deletes/re-creates every one of its
// restaurant_hours rows, so a day omitted from `days` ends up with no row (not
// "unchanged") — the caller (merchant edit form) must always submit the full week.
export const updateOwnHours = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = requireRestaurantId(req);
  const days = Array.isArray(req.body?.days) ? req.body.days : [];
  const result = await merchantRestaurantService.updateOwnHours(restaurantId, days);
  res.json(result);
});

// Bulk replace-all: body is `{ cuisines: string[] }`. setForRestaurant() deletes and
// re-creates every one of this restaurant's restaurant_cuisines rows, so a cuisine omitted
// from `cuisines` ends up unlinked (not "unchanged") — the caller must always submit the
// full desired set. Each name must match an existing cuisines.name exactly.
export const updateOwnCuisines = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = requireRestaurantId(req);
  const cuisines = Array.isArray(req.body?.cuisines) ? req.body.cuisines : [];
  const result = await merchantRestaurantService.updateOwnCuisines(restaurantId, cuisines);
  res.json(result);
});

export const updateOwnLocation = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = requireRestaurantId(req);
  const result = await merchantRestaurantService.updateOwnLocation(restaurantId, req.body ?? {});
  res.json(result);
});

// Bulk replace-all, multipart/form-data (see routes/merchant/restaurant.routes.ts's
// upload.array('gallery', ...)): `keep` is a JSON-encoded array of existing gallery
// URLs, in the merchant's desired final order (this is how reordering/removal is
// expressed — an existing URL omitted from `keep` is dropped); any attached `gallery`
// files are uploaded and appended after `keep`, in submission order. Whatever was on
// the restaurant's gallery before but isn't in the final array is best-effort deleted
// from Drive, same cleanup convention as logo/banner in updateOwn above.
export const updateOwnGallery = asyncHandler(async (req: Request, res: Response) => {
  const restaurantId = requireRestaurantId(req);

  let keep: unknown[];
  try {
    keep = req.body?.keep ? JSON.parse(req.body.keep) : [];
  } catch {
    throw new AppError(400, 'keep must be a JSON array of existing gallery URLs');
  }
  if (!Array.isArray(keep) || !keep.every((v) => typeof v === 'string')) {
    throw new AppError(400, 'keep must be a JSON array of strings');
  }

  const current = await merchantRestaurantService.getOwn(restaurantId);
  const currentGallery = Array.isArray(current.gallery) ? (current.gallery as string[]) : [];

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const uploaded = await Promise.all(files.map((file) => uploadImage(file)));

  const gallery = [...(keep as string[]), ...uploaded];
  const removed = currentGallery.filter((url) => !gallery.includes(url));
  await Promise.all(removed.map((url) => deleteImageBestEffort(url)));

  const result = await merchantRestaurantService.updateOwnGallery(restaurantId, gallery);
  res.json(result);
});

export const getOwnSubscription = asyncHandler(async (req: Request, res: Response) => {
  const subscription = await merchantRestaurantService.getOwnSubscription(requireRestaurantId(req));
  res.json({ subscription });
});

export const getOwnInvoices = asyncHandler(async (req: Request, res: Response) => {
  const result = await merchantRestaurantService.getOwnInvoices(requireRestaurantId(req), {
    status: req.query.status as string | undefined,
    limit:  req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    offset: req.query.offset !== undefined ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

export const addOwnInvoiceAttachment = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new AppError(400, 'file is required');
  }

  const file_url = await uploadFile(file);
  const attachment = await merchantRestaurantService.addOwnInvoiceAttachment(
    requireRestaurantId(req),
    req.params.invoiceId as string,
    { file_url, file_name: file.originalname, mime_type: file.mimetype },
    req.user!.user_id
  );
  res.status(201).json({ attachment });
});
