import { Request, Response } from 'express';
import { log } from '../../utils/logger.js';
import {
  SupportError,
  addStaffReply,
  addUserMessage,
  createThread,
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
    return addUserMessage(tenant.id, employee.id, req.params.id, req.body.body, employee.name);
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
    return addStaffReply(req.params.id, req.body.body, name);
  });
}

export async function patchPlatformSupportTicket(req: Request, res: Response): Promise<void> {
  await withSupport(res, async () => updateTicketStatus(req.params.id, req.body.status));
}
