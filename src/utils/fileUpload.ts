import { adapter } from '../lib/adapter';

// Generic counterpart to imageUpload.ts — same DriveStorageAdapter underneath (it isn't
// actually image-specific), just not restricted to image mime types. Used for invoice
// attachments (PDFs, scanned receipts) rather than restaurant/catalog imagery.

export async function uploadFile(file: Express.Multer.File): Promise<string> {
  return adapter.upload(file.buffer, {
    filename: file.originalname,
    mimeType: file.mimetype,
    public: true,
  });
}

// Best-effort: a Drive delete failure (already removed, permission hiccup, etc.)
// should never fail the request that's removing the row pointing at it.
export async function deleteFileBestEffort(url?: string | null): Promise<void> {
  if (!url) return;
  try {
    await adapter.deleteFile(url);
  } catch (err) {
    console.error('Failed to delete file from storage:', url, err);
  }
}
