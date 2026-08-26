import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { uploadFile } from '../../utils/fileUpload';
import * as invoicesService from '../../services/admin/invoices.service';

export const list = asyncHandler(async (req: Request, res: Response) => {
  const result = await invoicesService.list({
    restaurant_id: req.query.restaurant_id as string | undefined,
    status:        req.query.status as string | undefined,
    limit:         req.query.limit !== undefined ? Number(req.query.limit) : undefined,
    offset:        req.query.offset !== undefined ? Number(req.query.offset) : undefined,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const result = await invoicesService.getById(req.params.id as string);
  res.json(result);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.create(req.body);
  res.status(201).json({ invoice });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const invoice = await invoicesService.update(req.params.id as string, req.body, req.user!.user_id);
  res.json({ invoice });
});

export const addAttachment = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new AppError(400, 'file is required');
  }

  const file_url = await uploadFile(file);
  const attachment = await invoicesService.addAttachment(
    req.params.id as string,
    { file_url, file_name: file.originalname, mime_type: file.mimetype },
    req.user!.user_id,
    'invoice' // admin-uploaded — see merchant/restaurant.controller.ts's addOwnInvoiceAttachment for the 'receipt' side
  );
  res.status(201).json({ attachment });
});

export const deleteAttachment = asyncHandler(async (req: Request, res: Response) => {
  await invoicesService.deleteAttachment(req.params.id as string, req.params.attachmentId as string);
  res.status(204).send();
});

// POST /admin/invoices/generate — see invoices.service.ts's generateDueInvoices()
// header comment for how this is meant to be called (by hand or by an external cron).
export const generate = asyncHandler(async (req: Request, res: Response) => {
  const type = (req.body?.type as 'subscription' | 'commission' | 'all' | undefined) ?? 'all';
  const invoices = await invoicesService.generateDueInvoices(type);
  res.json({ invoices, count: invoices.length });
});
