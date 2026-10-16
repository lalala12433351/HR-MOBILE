import { Request, Response } from 'express';
import { pool } from '../../config/database.js';
import { listLicenseEvents, listPublicPlans, syncAndSummarizeLicense } from './license.service.js';

export async function listPublicLicensePlans(_req: Request, res: Response): Promise<void> {
  try {
    const plans = await listPublicPlans(pool);
    res.json({ success: true, data: plans });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getCurrentLicense(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenant?.id || req.user?.tenant_id;
    if (!tenantId) {
      res.status(400).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Workspace context is required.' } });
      return;
    }
    const license = await syncAndSummarizeLicense(pool, tenantId, req.user?.email);
    res.json({ success: true, data: license });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getCurrentLicenseEvents(req: Request, res: Response): Promise<void> {
  try {
    const tenantId = req.tenant?.id || req.user?.tenant_id;
    if (!tenantId) {
      res.status(400).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Workspace context is required.' } });
      return;
    }
    const events = await listLicenseEvents(pool, tenantId, 50);
    res.json({ success: true, data: events });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
