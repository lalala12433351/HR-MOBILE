import { Request, Response } from 'express';
import { ensureChatTables } from '../../db/ensureChatTables.js';
import { log } from '../../utils/logger.js';
import { ChatError, resolveChatEmployee, TenantQuery } from '../chat/chat.service.js';
import { deleteSubscription, pushConfigured, saveSubscription, vapidPublicKey } from './push.service.js';

async function employeeId(req: Request): Promise<{ q: TenantQuery; id: string }> {
  const schema = req.dbSchema!;
  await ensureChatTables(schema);
  const q = req.tenantQuery as unknown as TenantQuery;
  const me = await resolveChatEmployee(q, req.user!.sub, req.user!.email);
  if (!me) {
    throw new ChatError(403, 'NO_EMPLOYEE_PROFILE', 'Push is available to employees with a profile in this workspace.');
  }
  return { q, id: me.id };
}

function fail(res: Response, err: any) {
  if (err instanceof ChatError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message } });
    return;
  }
  log.error('Push request failed', err);
  res.status(500).json({ success: false, error: { code: 'PUSH_ERROR', message: err?.message || 'Push request failed' } });
}

export async function getVapidPublicKey(req: Request, res: Response): Promise<void> {
  try {
    await ensureChatTables(req.dbSchema!);
    res.json({
      success: true,
      data: { publicKey: vapidPublicKey(), enabled: pushConfigured() },
    });
  } catch (err) {
    fail(res, err);
  }
}

export async function putSubscription(req: Request, res: Response): Promise<void> {
  try {
    if (!pushConfigured()) {
      res.status(503).json({
        success: false,
        error: { code: 'PUSH_UNAVAILABLE', message: 'Desktop alerts are unavailable until the server is configured.' },
      });
      return;
    }
    const { q, id } = await employeeId(req);
    const agent = req.get('user-agent') || null;
    await saveSubscription(q, id, req.body, agent ? agent.slice(0, 512) : null);
    res.json({ success: true, data: { subscribed: true } });
  } catch (err) {
    fail(res, err);
  }
}

export async function removeSubscription(req: Request, res: Response): Promise<void> {
  try {
    const { q, id } = await employeeId(req);
    await deleteSubscription(q, id, req.body.endpoint);
    res.json({ success: true, data: { subscribed: false } });
  } catch (err) {
    fail(res, err);
  }
}
