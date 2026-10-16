import { Request, Response } from 'express';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(val: any): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

function shiftIsoDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export async function ensureBillingSchema(req: Request): Promise<void> {
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS billing_clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(128) NOT NULL,
      company_name VARCHAR(128),
      email VARCHAR(255),
      phone VARCHAR(32),
      billing_address TEXT,
      gstin VARCHAR(32),
      currency VARCHAR(8) NOT NULL DEFAULT 'INR',
      payment_terms_days INTEGER NOT NULL DEFAULT 15,
      default_hourly_rate NUMERIC(12, 2),
      notes TEXT,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await req.tenantQuery!(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS client_id UUID`);
  await req.tenantQuery!(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS client_id UUID`);
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      invoice_number VARCHAR(32) NOT NULL,
      customer_name VARCHAR(128),
      issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
      due_date DATE,
      subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
      gst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS invoice_lines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
      unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
      total NUMERIC(12, 2) NOT NULL DEFAULT 0,
      source_task_id UUID,
      source_timesheet_id UUID
    )
  `);
  await req.tenantQuery!(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS client_id UUID`);
  await req.tenantQuery!(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_start DATE`);
  await req.tenantQuery!(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_period_end DATE`);
  await req.tenantQuery!(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'project'`);
  try {
    await req.tenantQuery!(`ALTER TABLE invoices ALTER COLUMN project_id DROP NOT NULL`);
  } catch {
    // already nullable or table created that way
  }
}

function hourlyRate(task: any, project: any, client: any): number {
  const taskRate = Number(task?.unit_price);
  if (String(task?.billing_type || '').toLowerCase() === 'hourly' && taskRate > 0) return taskRate;
  const projectRate = Number(project?.hourly_rate);
  if (projectRate > 0) return projectRate;
  const clientRate = Number(client?.default_hourly_rate);
  if (clientRate > 0) return clientRate;
  return 0;
}

export async function listClients(req: Request, res: Response): Promise<void> {
  try {
    await ensureBillingSchema(req);
    const result = await req.tenantQuery!(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM projects p WHERE p.client_id = c.id) AS project_count
       FROM billing_clients c
       ORDER BY lower(c.name)`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createClient(req: Request, res: Response): Promise<void> {
  try {
    await ensureBillingSchema(req);
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'Client name is required' } });
      return;
    }
    const result = await req.tenantQuery!(
      `INSERT INTO billing_clients (
         name, company_name, email, phone, billing_address, gstin, currency,
         payment_terms_days, default_hourly_rate, notes, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        name,
        String(body.companyName || body.company_name || name).trim() || name,
        String(body.email || '').trim() || null,
        String(body.phone || '').trim() || null,
        String(body.billingAddress || body.billing_address || '').trim() || null,
        String(body.gstin || '').trim() || null,
        String(body.currency || 'INR').slice(0, 8),
        Math.max(0, Number(body.paymentTermsDays ?? body.payment_terms_days) || 15),
        body.defaultHourlyRate === '' || body.defaultHourlyRate == null
          ? body.default_hourly_rate == null || body.default_hourly_rate === ''
            ? null
            : Number(body.default_hourly_rate)
          : Number(body.defaultHourlyRate),
        String(body.notes || '').trim() || null,
        String(body.status || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateClient(req: Request, res: Response): Promise<void> {
  try {
    await ensureBillingSchema(req);
    const { id } = req.params;
    if (!isUuid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid client id' } });
      return;
    }
    const body = req.body || {};
    const updates: string[] = [];
    const params: any[] = [];
    const push = (col: string, val: any) => {
      params.push(val);
      updates.push(`${col} = $${params.length}`);
    };
    if (body.name !== undefined) push('name', String(body.name).trim());
    if (body.companyName !== undefined || body.company_name !== undefined) {
      push('company_name', String(body.companyName ?? body.company_name ?? '').trim() || null);
    }
    if (body.email !== undefined) push('email', String(body.email).trim() || null);
    if (body.phone !== undefined) push('phone', String(body.phone).trim() || null);
    if (body.billingAddress !== undefined || body.billing_address !== undefined) {
      push('billing_address', String(body.billingAddress ?? body.billing_address ?? '').trim() || null);
    }
    if (body.gstin !== undefined) push('gstin', String(body.gstin).trim() || null);
    if (body.currency !== undefined) push('currency', String(body.currency || 'INR').slice(0, 8));
    if (body.paymentTermsDays !== undefined || body.payment_terms_days !== undefined) {
      push('payment_terms_days', Math.max(0, Number(body.paymentTermsDays ?? body.payment_terms_days) || 0));
    }
    if (body.defaultHourlyRate !== undefined || body.default_hourly_rate !== undefined) {
      const raw = body.defaultHourlyRate ?? body.default_hourly_rate;
      push('default_hourly_rate', raw === '' || raw == null ? null : Number(raw));
    }
    if (body.notes !== undefined) push('notes', String(body.notes).trim() || null);
    if (body.status !== undefined) {
      push('status', String(body.status).toLowerCase() === 'inactive' ? 'inactive' : 'active');
    }
    if (updates.length === 0) {
      res.status(400).json({ success: false, error: { code: 'NO_UPDATES', message: 'No valid fields to update' } });
      return;
    }
    params.push(id);
    const result = await req.tenantQuery!(
      `UPDATE billing_clients SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Client not found' } });
      return;
    }
    await req.tenantQuery!(
      `UPDATE projects SET client_name = $2 WHERE client_id = $1`,
      [id, result.rows[0].company_name || result.rows[0].name]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getUnbilled(req: Request, res: Response): Promise<void> {
  try {
    await ensureBillingSchema(req);
    const clientId = String(req.query.clientId || '').trim();
    const projectId = String(req.query.projectId || '').trim();
    const from = String(req.query.from || '').trim() || null;
    const to = String(req.query.to || '').trim() || null;

    const filters: string[] = [];
    const params: any[] = [];
    const add = (sql: string, val: any) => {
      params.push(val);
      filters.push(sql.replace('?', `$${params.length}`));
    };

    if (isUuid(clientId)) {
      add(`COALESCE(t.client_id, p.client_id) = ?`, clientId);
    }
    if (isUuid(projectId)) {
      add(`p.id = ?`, projectId);
    }

    const taskDate = `COALESCE(t.occurrence_date, t.due_date, t.created_at::date)`;
    const taskWhere = [
      `COALESCE(t.is_recurrence_template, false) = false`,
      `COALESCE(t.billable, true) = true`,
      `t.invoice_id IS NULL`,
      `t.status = 'done'`,
      `COALESCE(t.billing_type, 'deliverable') = 'deliverable'`,
      ...filters,
    ];
    if (from) {
      params.push(from);
      taskWhere.push(`${taskDate} >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      taskWhere.push(`${taskDate} <= $${params.length}`);
    }

    const tasks = await req.tenantQuery!(
      `SELECT t.id, t.title, t.unit_price, t.billing_type, t.billable, t.status,
              t.occurrence_date, t.due_date, t.assigned_to_employee_id, t.project_id, t.client_id,
              p.name AS project_name, p.hourly_rate, p.client_id AS project_client_id,
              p.client_name, p.currency,
              c.id AS resolved_client_id, c.name AS client_name_resolved, c.default_hourly_rate
       FROM project_tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN billing_clients c ON c.id = COALESCE(t.client_id, p.client_id)
       WHERE ${taskWhere.join(' AND ')}
       ORDER BY ${taskDate} DESC`,
      params
    );

    const tsFilters: string[] = [];
    const tsParams: any[] = [];
    const addTs = (sql: string, val: any) => {
      tsParams.push(val);
      tsFilters.push(sql.replace('?', `$${tsParams.length}`));
    };
    if (isUuid(clientId)) addTs(`COALESCE(t.client_id, p.client_id) = ?`, clientId);
    if (isUuid(projectId)) addTs(`p.id = ?`, projectId);

    const tsWhere = [
      `COALESCE(ts.billable, true) = true`,
      `ts.invoice_id IS NULL`,
      `ts.status = 'approved'`,
      `ts.end_time IS NOT NULL`,
      ...tsFilters,
    ];
    if (from) {
      tsParams.push(from);
      tsWhere.push(`ts.work_date >= $${tsParams.length}`);
    }
    if (to) {
      tsParams.push(to);
      tsWhere.push(`ts.work_date <= $${tsParams.length}`);
    }

    const timesheets = await req.tenantQuery!(
      `SELECT ts.id, ts.hours_spent, ts.work_date, ts.description, ts.employee_id, ts.task_id, ts.project_id,
              COALESCE(t.title, ts.title, ts.description) AS task_title,
              t.occurrence_date, t.billing_type, t.unit_price AS task_unit_price, t.client_id AS task_client_id,
              p.name AS project_name, p.hourly_rate, p.client_id AS project_client_id, p.client_name, p.currency,
              e.first_name || ' ' || e.last_name AS employee_name,
              c.id AS resolved_client_id, c.name AS client_name_resolved, c.default_hourly_rate
       FROM timesheets ts
       JOIN projects p ON p.id = ts.project_id
       JOIN employees e ON e.id = ts.employee_id
       LEFT JOIN project_tasks t ON t.id = ts.task_id
       LEFT JOIN billing_clients c ON c.id = COALESCE(t.client_id, p.client_id)
       WHERE ${tsWhere.join(' AND ')}
       ORDER BY ts.work_date DESC`,
      tsParams
    );

    const taskLines = tasks.rows.map((task: any) => ({
      kind: 'deliverable',
      sourceTaskId: task.id,
      sourceTimesheetId: null,
      description: `${task.project_name}: ${task.title}`,
      quantity: 1,
      unitPrice: Number(task.unit_price) || 0,
      total: Number(task.unit_price) || 0,
      date: task.occurrence_date || task.due_date,
      projectId: task.project_id,
      projectName: task.project_name,
      clientId: task.resolved_client_id,
      clientName: task.client_name_resolved || task.client_name,
      currency: task.currency || 'INR',
    }));

    const timesheetLines = timesheets.rows.map((ts: any) => {
      const rate = hourlyRate(
        { billing_type: ts.billing_type, unit_price: ts.task_unit_price },
        { hourly_rate: ts.hourly_rate },
        { default_hourly_rate: ts.default_hourly_rate }
      );
      const hours = Number(ts.hours_spent) || 0;
      return {
        kind: 'hourly',
        sourceTaskId: null,
        sourceTimesheetId: ts.id,
        description: `${ts.project_name}: ${ts.task_title} (${ts.employee_name})`,
        quantity: hours,
        unitPrice: rate,
        total: Number((hours * rate).toFixed(2)),
        date: ts.work_date,
        projectId: ts.project_id,
        projectName: ts.project_name,
        clientId: ts.resolved_client_id,
        clientName: ts.client_name_resolved || ts.client_name,
        employeeName: ts.employee_name,
        currency: ts.currency || 'INR',
      };
    });

    res.json({
      success: true,
      data: {
        tasks: tasks.rows,
        timesheets: timesheets.rows,
        lines: [...taskLines, ...timesheetLines],
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

async function attachInvoiceLines(req: Request, invoices: any[]): Promise<any[]> {
  if (!invoices.length) return [];
  const lines = await req.tenantQuery!(
    `SELECT * FROM invoice_lines WHERE invoice_id = ANY($1::uuid[]) ORDER BY id`,
    [invoices.map((row) => row.id)]
  );
  return invoices.map((inv) => ({
    ...inv,
    lines: lines.rows.filter((line: any) => line.invoice_id === inv.id),
  }));
}

export async function listInvoices(req: Request, res: Response): Promise<void> {
  try {
    await ensureBillingSchema(req);
    const clientId = String(req.query.clientId || '').trim();
    const params: any[] = [];
    let where = '';
    if (isUuid(clientId)) {
      params.push(clientId);
      where = `WHERE i.client_id = $1`;
    }
    const invoices = await req.tenantQuery!(
      `SELECT i.*,
              c.name AS client_name,
              c.company_name,
              c.email AS client_email,
              c.billing_address,
              c.gstin,
              c.payment_terms_days,
              c.currency AS client_currency,
              p.name AS project_name
       FROM invoices i
       LEFT JOIN billing_clients c ON c.id = i.client_id
       LEFT JOIN projects p ON p.id = i.project_id
       ${where}
       ORDER BY i.created_at DESC`,
      params
    );
    res.json({ success: true, data: await attachInvoiceLines(req, invoices.rows) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getInvoice(req: Request, res: Response): Promise<void> {
  try {
    await ensureBillingSchema(req);
    const { id } = req.params;
    const invoices = await req.tenantQuery!(
      `SELECT i.*,
              c.name AS client_name,
              c.company_name,
              c.email AS client_email,
              c.phone AS client_phone,
              c.billing_address,
              c.gstin,
              c.payment_terms_days,
              c.currency AS client_currency,
              p.name AS project_name
       FROM invoices i
       LEFT JOIN billing_clients c ON c.id = i.client_id
       LEFT JOIN projects p ON p.id = i.project_id
       WHERE i.id = $1`,
      [id]
    );
    if (!invoices.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
      return;
    }
    const [grouped] = await attachInvoiceLines(req, invoices.rows);
    res.json({ success: true, data: grouped });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createInvoice(req: Request, res: Response): Promise<void> {
  try {
    await ensureBillingSchema(req);
    const body = req.body || {};
    const clientId = String(body.clientId || body.client_id || '').trim();
    if (!isUuid(clientId)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'clientId is required' } });
      return;
    }
    const client = await req.tenantQuery!(`SELECT * FROM billing_clients WHERE id = $1`, [clientId]);
    if (!client.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Client not found' } });
      return;
    }

    const kind = String(body.kind || 'monthly').toLowerCase() === 'project' ? 'project' : 'monthly';
    const projectId = isUuid(String(body.projectId || body.project_id || ''))
      ? String(body.projectId || body.project_id)
      : null;
    if (kind === 'project' && !projectId) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'projectId is required for project invoices' } });
      return;
    }

    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PAYLOAD', message: 'At least one line is required' } });
      return;
    }

    const normalized = lines.map((line: any) => {
      const quantity = Math.max(0, Number(line.quantity) || 0);
      const unitPrice = Math.max(0, Number(line.unitPrice ?? line.unit_price) || 0);
      return {
        description: String(line.description || 'Work').trim() || 'Work',
        quantity,
        unitPrice,
        total: Number((quantity * unitPrice).toFixed(2)),
        sourceTaskId: line.sourceTaskId || line.source_task_id || null,
        sourceTimesheetId: line.sourceTimesheetId || line.source_timesheet_id || null,
      };
    });

    for (const line of normalized) {
      if (line.sourceTaskId) {
        const task = await req.tenantQuery!(
          `SELECT t.id, t.invoice_id, t.project_id, t.status, COALESCE(t.client_id, p.client_id) AS client_id
           FROM project_tasks t
           JOIN projects p ON p.id = t.project_id
           WHERE t.id = $1`,
          [line.sourceTaskId]
        );
        const row = task.rows[0];
        if (!row) {
          res.status(400).json({ success: false, error: { code: 'INVALID_LINE', message: 'Task not found' } });
          return;
        }
        if (row.invoice_id) {
          res.status(409).json({ success: false, error: { code: 'ALREADY_BILLED', message: 'Task is already on an invoice' } });
          return;
        }
        if (row.status !== 'done') {
          res.status(400).json({ success: false, error: { code: 'NOT_COMPLETE', message: 'Only completed tasks can be invoiced' } });
          return;
        }
        if (row.client_id && row.client_id !== clientId) {
          res.status(400).json({ success: false, error: { code: 'CLIENT_MISMATCH', message: 'Task belongs to a different client' } });
          return;
        }
        if (projectId && row.project_id !== projectId) {
          res.status(400).json({ success: false, error: { code: 'PROJECT_MISMATCH', message: 'Task is not part of this project' } });
          return;
        }
      }
      if (line.sourceTimesheetId) {
        const ts = await req.tenantQuery!(
          `SELECT ts.id, ts.invoice_id, ts.project_id, ts.status, COALESCE(t.client_id, p.client_id) AS client_id
           FROM timesheets ts
           JOIN projects p ON p.id = ts.project_id
           LEFT JOIN project_tasks t ON t.id = ts.task_id
           WHERE ts.id = $1`,
          [line.sourceTimesheetId]
        );
        const row = ts.rows[0];
        if (!row) {
          res.status(400).json({ success: false, error: { code: 'INVALID_LINE', message: 'Timesheet not found' } });
          return;
        }
        if (row.invoice_id) {
          res.status(409).json({ success: false, error: { code: 'ALREADY_BILLED', message: 'Timesheet is already on an invoice' } });
          return;
        }
        if (row.status !== 'approved') {
          res.status(400).json({ success: false, error: { code: 'NOT_APPROVED', message: 'Only approved timesheets can be invoiced' } });
          return;
        }
        if (row.client_id && row.client_id !== clientId) {
          res.status(400).json({ success: false, error: { code: 'CLIENT_MISMATCH', message: 'Timesheet belongs to a different client' } });
          return;
        }
        if (projectId && row.project_id !== projectId) {
          res.status(400).json({ success: false, error: { code: 'PROJECT_MISMATCH', message: 'Timesheet is not part of this project' } });
          return;
        }
      }
    }

    const subtotal = Number(normalized.reduce((sum: number, line: any) => sum + line.total, 0).toFixed(2));
    const gstAmount = Number((subtotal * 0.18).toFixed(2));
    const totalAmount = Number((subtotal + gstAmount).toFixed(2));
    const count = await req.tenantQuery!(`SELECT COUNT(*)::int AS n FROM invoices`);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(Number(count.rows[0]?.n || 0) + 1).padStart(4, '0')}`;
    const issueDate = new Date().toISOString().slice(0, 10);
    const terms = Number(client.rows[0].payment_terms_days) || 15;
    const dueDate = body.dueDate || shiftIsoDate(issueDate, terms);
    const periodStart = body.periodStart || body.billing_period_start || null;
    const periodEnd = body.periodEnd || body.billing_period_end || null;

    const invoice = await req.tenantQuery!(
      `INSERT INTO invoices (
         project_id, client_id, invoice_number, customer_name, issue_date, due_date,
         billing_period_start, billing_period_end, kind,
         subtotal, gst_amount, total_amount, paid_amount, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, 'draft')
       RETURNING *`,
      [
        kind === 'project' ? projectId : null,
        clientId,
        invoiceNumber,
        client.rows[0].company_name || client.rows[0].name,
        issueDate,
        dueDate,
        periodStart,
        periodEnd,
        kind,
        subtotal,
        gstAmount,
        totalAmount,
      ]
    );

    const invoiceId = invoice.rows[0].id;
    const savedLines: any[] = [];
    for (const line of normalized) {
      const inserted = await req.tenantQuery!(
        `INSERT INTO invoice_lines (invoice_id, description, quantity, unit_price, total, source_task_id, source_timesheet_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [invoiceId, line.description, line.quantity, line.unitPrice, line.total, line.sourceTaskId, line.sourceTimesheetId]
      );
      savedLines.push(inserted.rows[0]);
      if (line.sourceTaskId) {
        await req.tenantQuery!(`UPDATE project_tasks SET invoice_id = $1 WHERE id = $2 AND invoice_id IS NULL`, [invoiceId, line.sourceTaskId]);
      }
      if (line.sourceTimesheetId) {
        await req.tenantQuery!(`UPDATE timesheets SET invoice_id = $1 WHERE id = $2 AND invoice_id IS NULL`, [invoiceId, line.sourceTimesheetId]);
      }
    }

    res.status(201).json({ success: true, data: { ...invoice.rows[0], lines: savedLines } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateInvoiceStatus(req: Request, res: Response): Promise<void> {
  try {
    await ensureBillingSchema(req);
    const { id } = req.params;
    const statusRaw = String(req.body?.status || '').toLowerCase().replace(/\s+/g, '_');
    const allowed = ['draft', 'sent', 'paid', 'partially_paid', 'overdue'];
    if (!allowed.includes(statusRaw)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STATUS', message: 'Unsupported invoice status' } });
      return;
    }
    const result = await req.tenantQuery!(
      `UPDATE invoices
       SET status = $2,
           paid_amount = CASE WHEN $2 = 'paid' THEN total_amount ELSE paid_amount END
       WHERE id = $1
       RETURNING *`,
      [id, statusRaw]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Invoice not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
