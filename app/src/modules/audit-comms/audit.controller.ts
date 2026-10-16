import { Request, Response } from 'express';

export async function getAnnouncements(req: Request, res: Response): Promise<void> {
  try {
    await ensureAnnouncementExtras(req);
    const result = await req.tenantQuery!(
      `SELECT 
        a.id,
        a.title,
        a.content,
        a.author_employee_id,
        a.target_department_id,
        a.priority,
        a.category,
        a.pin_to_header_banner,
        a.tags,
        a.attachment_file_name,
        a.attachment_file_url,
        a.attachment_file_size,
        a.attachment_mime_type,
        a.is_published,
        a.published_at,
        a.created_at,
        e.first_name || ' ' || e.last_name as author_name,
        d.name as department_name
       FROM announcements a
       LEFT JOIN employees e ON a.author_employee_id = e.id
       LEFT JOIN departments d ON a.target_department_id = d.id
       WHERE a.is_published = true
       ORDER BY a.pin_to_header_banner DESC, a.published_at DESC LIMIT 50`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createAnnouncement(req: Request, res: Response): Promise<void> {
  try {
    await ensureAnnouncementExtras(req);
    const {
      title,
      content,
      authorEmployeeId,
      targetDepartmentId,
      priority = 'normal',
      category = 'GENERAL',
      pinToHeaderBanner = false,
      tags = [],
      attachment,
    } = req.body;

    let validAuthorId: string | null = null;
    if (authorEmployeeId) {
      const emp = await req.tenantQuery!('SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 LIMIT 1', [authorEmployeeId]);
      validAuthorId = emp.rows[0]?.id ?? null;
    }
    if (!validAuthorId) {
      const firstEmp = await req.tenantQuery!('SELECT id FROM employees LIMIT 1');
      validAuthorId = firstEmp.rows[0]?.id ?? null;
    }

    const tagsJson = JSON.stringify(Array.isArray(tags) ? tags : []);
    const attachmentName = attachment?.fileName || null;
    const attachmentUrl = attachment?.fileUrl || null;
    const attachmentSize = attachment?.fileSize || null;
    const attachmentMime = attachment?.mimeType || null;

    const result = await req.tenantQuery!(
      `INSERT INTO announcements (
        title, content, author_employee_id, target_department_id, priority, category, pin_to_header_banner, tags,
        attachment_file_name, attachment_file_url, attachment_file_size, attachment_mime_type
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        title,
        content,
        validAuthorId,
        targetDepartmentId || null,
        priority,
        String(category).toUpperCase(),
        Boolean(pinToHeaderBanner),
        tagsJson,
        attachmentName,
        attachmentUrl,
        attachmentSize,
        attachmentMime,
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId } = req.query;
    let sql = `SELECT * FROM notifications WHERE 1=1`;
    const params: any[] = [];
    if (employeeId) {
      params.push(employeeId);
      sql += ` AND recipient_employee_id::text = $${params.length}`;
    }
    sql += ` ORDER BY created_at DESC LIMIT 100`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function markNotificationRead(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await req.tenantQuery!(
      `UPDATE notifications SET is_read = true WHERE id = $1`,
      [id]
    );
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const result = await req.tenantQuery!(
      `SELECT * FROM audit_trail ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

const announcementExtrasEnsured = new Set<string>();

async function ensureAnnouncementExtras(req: Request): Promise<void> {
  const schema = req.dbSchema || req.tenant?.schema || '';
  if (schema && announcementExtrasEnsured.has(schema)) return;

  await req.tenantQuery!(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS pin_to_header_banner BOOLEAN NOT NULL DEFAULT false`);
  await req.tenantQuery!(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'GENERAL'`);
  await req.tenantQuery!(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb`);
  await req.tenantQuery!(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_file_name VARCHAR(255)`);
  await req.tenantQuery!(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_file_url TEXT`);
  await req.tenantQuery!(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_file_size BIGINT`);
  await req.tenantQuery!(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS attachment_mime_type VARCHAR(128)`);
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS announcement_reactions (
      announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      emoji VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, employee_id, emoji)
    )
  `);
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS announcement_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
      author_name VARCHAR(128),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS announcement_reads (
      announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (announcement_id, employee_id)
    )
  `);

  if (schema) announcementExtrasEnsured.add(schema);
}

export async function markAnnouncementRead(req: Request, res: Response): Promise<void> {
  try {
    await ensureAnnouncementExtras(req);
    const { id } = req.params;
    const employeeId = req.body?.employeeId;
    if (!employeeId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'employeeId required' } });
      return;
    }
    await req.tenantQuery!(
      `INSERT INTO announcement_reads (announcement_id, employee_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [id, employeeId]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function toggleAnnouncementReaction(req: Request, res: Response): Promise<void> {
  try {
    await ensureAnnouncementExtras(req);
    const { id } = req.params;
    const { emoji, employeeId } = req.body || {};
    if (!emoji || !employeeId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'emoji and employeeId required' } });
      return;
    }

    const existing = await req.tenantQuery!(
      `SELECT 1 FROM announcement_reactions WHERE announcement_id = $1 AND employee_id = $2 AND emoji = $3`,
      [id, employeeId, String(emoji)]
    );

    if (existing.rows.length > 0) {
      await req.tenantQuery!(
        `DELETE FROM announcement_reactions WHERE announcement_id = $1 AND employee_id = $2 AND emoji = $3`,
        [id, employeeId, String(emoji)]
      );
      res.json({ success: true, data: { reacted: false } });
      return;
    }

    await req.tenantQuery!(
      `INSERT INTO announcement_reactions (announcement_id, employee_id, emoji) VALUES ($1, $2, $3)`,
      [id, employeeId, String(emoji)]
    );
    res.json({ success: true, data: { reacted: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function addAnnouncementComment(req: Request, res: Response): Promise<void> {
  try {
    await ensureAnnouncementExtras(req);
    const { id } = req.params;
    const { content, employeeId, authorName } = req.body || {};
    if (!content || String(content).trim().length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'content required' } });
      return;
    }

    const result = await req.tenantQuery!(
      `INSERT INTO announcement_comments (announcement_id, employee_id, author_name, content)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, employeeId || null, authorName || null, String(content).trim()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function toggleAnnouncementPin(req: Request, res: Response): Promise<void> {
  try {
    await ensureAnnouncementExtras(req);
    const { id } = req.params;
    const result = await req.tenantQuery!(
      `UPDATE announcements
       SET pin_to_header_banner = NOT COALESCE(pin_to_header_banner, false)
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Announcement not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteAnnouncement(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await req.tenantQuery!(`DELETE FROM announcements WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Announcement not found' } });
      return;
    }
    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function markAllNotificationsRead(req: Request, res: Response): Promise<void> {
  try {
    const employeeId = (req.query.employeeId as string) || req.body?.employeeId;
    if (employeeId) {
      await req.tenantQuery!(
        `UPDATE notifications SET is_read = true WHERE recipient_employee_id::text = $1`,
        [employeeId]
      );
    } else {
      await req.tenantQuery!(`UPDATE notifications SET is_read = true`);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteNotification(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await req.tenantQuery!(`DELETE FROM notifications WHERE id = $1 RETURNING id`, [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Notification not found' } });
      return;
    }
    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function clearAllNotifications(req: Request, res: Response): Promise<void> {
  try {
    const employeeId = (req.query.employeeId as string) || req.body?.employeeId;
    if (employeeId) {
      await req.tenantQuery!(`DELETE FROM notifications WHERE recipient_employee_id::text = $1`, [employeeId]);
    } else {
      await req.tenantQuery!(`DELETE FROM notifications`);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
