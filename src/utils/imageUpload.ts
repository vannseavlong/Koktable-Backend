import { adapter } from '../lib/adapter';

// Shared by the restaurant (logo/banner) and catalog-items (image) upload paths —
// wraps the longcelot-sheet-db DriveStorageAdapter configured in lib/adapter.ts.

export async function uploadImage(file: Express.Multer.File): Promise<string> {
  return adapter.upload(file.buffer, {
    filename: file.originalname,
    mimeType: file.mimetype,
    public: true,
  });
}

// Best-effort: a Drive delete failure (already removed, permission hiccup, etc.)
// should never fail the request that's replacing/removing the field pointing at it.
export async function deleteImageBestEffort(url?: string | null): Promise<void> {
  if (!url) return;
  try {
    await adapter.deleteFile(url);
  } catch (err) {
    console.error('Failed to delete image from storage:', url, err);
  }
}
