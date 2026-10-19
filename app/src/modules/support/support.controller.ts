import { Request, Response } from 'express';
import { log } from '../../utils/logger.js';
import {
  SupportError,
  addStaffReply,
  addUserMessage,
  attachmentDownloadUrl,
  createSupportUpload,
  createThread,
  getAttachmentForAdmin,
  getAttachmentForUser,
  getMyThread,
  getTicketForAdmin,
  listAllTickets,
  listMyThreads,
  resolveSupportEmployee,
  resolveTenantRecord,
  updateTicketStatus,
  type TenantQuery,
} from './support.service.js';

async function withSupport<T>(res: Response, fn: () => Promise<T>, status = 200): Promise<void> {
  try {
    const data = await fn();
    res.status(status).json({ success: true, data });
  } catch (err: any) {
    if (err instanceof SupportError) {
      res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
      return;
    }
    log.error('Support request failed', err);
    res.status(500).json({
      success: false,
      error: { code: 'SUPPORT_ERROR', message: err?.message || 'Support request failed' },
    });
  }
}

async function tenantActor(req: Request) {
  const q = req.tenantQuery as unknown as TenantQuery;
  const employee = await resolveSupportEmployee(q, req.user!.sub, req.user!.email);
  if (!employee) {
    throw new SupportError(
      403,
      'NO_EMPLOYEE_PROFILE',
      'Support chat is available to people with a profile in this workspace.'
    );
  }
  const tenant = await resolveTenantRecord({
    tenantId: req.user?.tenant_id || req.tenant?.id || req.tenantId,
    schema: req.dbSchema || req.tenant?.schema,
  });
  return { employee, tenant };
}

export async function getMySupportThreads(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => {
    const { employee, tenant } = await tenantActor(req);
    return listMyThreads(tenant.id, employee.id);
  });
}

export async function postSupportThread(req: Request, res: Response): Promise<void> {
  await withSupport(
    res,
    async () => {
      const { employee, tenant } = await tenantActor(req);
      return createThread({
        tenant,
        employee,
        subject: req.body.subject,
        body: req.body.body,
        category: req.body.category,
        priority: req.body.priority,
        attachments: req.body.attachments,
      });
    },
    201
  );
}

export async function getSupportThreadMessages(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => {
    const { employee, tenant } = await tenantActor(req);
    const thread = await getMyThread(tenant.id, employee.id, req.params.id, true);
    return thread.messages || [];
  });
}

export async function postSupportThreadMessage(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => {
    const { employee, tenant } = await tenantActor(req);
    return addUserMessage(
      tenant.id,
      employee.id,
      req.params.id,
      req.body.body,
      employee.name,
      req.body.attachments
    );
  });
}

export async function postSupportUpload(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => {
    const { tenant } = await tenantActor(req);
    return createSupportUpload(tenant.id, req.body);
  });
}

export async function getSupportAttachmentUrl(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => {
    const { employee, tenant } = await tenantActor(req);
    const attachment = await getAttachmentForUser(tenant.id, employee.id, req.params.id);
    const downloadUrl = await attachmentDownloadUrl(attachment.fileKey);
    return { ...attachment, downloadUrl };
  });
}

export async function listPlatformSupportTickets(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => listAllTickets(req.query.status as any));
}

export async function getPlatformSupportTicket(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => getTicketForAdmin(req.params.id));
}

export async function postPlatformSupportReply(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => {
    const name = req.user?.name || req.user?.email || 'Pixbe Support';
    return addStaffReply(req.params.id, req.body.body, name, req.body.attachments);
  });
}

export async function patchPlatformSupportTicket(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => updateTicketStatus(req.params.id, req.body.status));
}

export async function postPlatformSupportUpload(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => {
    const ticket = await getTicketForAdmin(req.params.id);
    return createSupportUpload(ticket.tenantId, req.body);
  });
}

export async function getPlatformSupportAttachmentUrl(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => {
    const attachment = await getAttachmentForAdmin(req.params.id);
    const downloadUrl = await attachmentDownloadUrl(attachment.fileKey);
    return { ...attachment, downloadUrl };
  });
}
