import { Request, Response } from 'express';
import { syncReportingHierarchy } from '../../utils/reportingHierarchy.js';
import { syncEmployeesToJobLevel } from '../../utils/roles.js';
import {
  ensureLeadTables,
  getLeadIds,
  setDepartmentLeads,
  setPrimaryDepartmentLead,
  setPrimaryTeamLead,
  setTeamLeads,
} from '../../utils/orgLeads.js';
import {
  ensureDepartmentShortCodes,
  normalizeShortCode,
  suggestShortCode,
  uniqueShortCode,
  validateShortCode,
} from '../../utils/departmentCodes.js';

function leadsJsonSql(table: string, fk: string, parentRef: string): string {
  return `COALESCE((
    SELECT json_agg(json_build_object(
             'id', le.id,
             'name', TRIM(COALESCE(le.first_name, '') || ' ' || COALESCE(NULLIF(le.last_name, 'User'), '')),
             'isPrimary', l.is_primary
           ) ORDER BY l.is_primary DESC, l.created_at ASC)
    FROM ${table} l
    JOIN employees le ON le.id = l.employee_id
    WHERE l.${fk} = ${parentRef}
  ), '[]'::json)`;
}

/** Applies leadEmployeeIds[] (full replace) or legacy leadEmployeeId (set primary). */
async function applyLeadPayload(
  req: Request,
  kind: 'department' | 'team',
  parentId: string,
  body: { leadEmployeeIds?: unknown; leadEmployeeId?: unknown }
): Promise<void> {
  const query = req.tenantQuery!;
  if (Array.isArray(body.leadEmployeeIds)) {
    const ids = body.leadEmployeeIds.map((id) => String(id));
    if (kind === 'department') await setDepartmentLeads(query, parentId, ids);
    else await setTeamLeads(query, parentId, ids);
    return;
  }
  const single = String(body.leadEmployeeId || '').trim();
  if (!single) return;
  if (kind === 'department') await setPrimaryDepartmentLead(query, parentId, single);
  else await setPrimaryTeamLead(query, parentId, single);
}

export async function getOffices(req: Request, res: Response): Promise<void> {
  try {
    const result = await req.tenantQuery!(
      `SELECT * FROM offices WHERE is_active = true ORDER BY name ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createOffice(req: Request, res: Response): Promise<void> {
  try {
    const { name, code, address, latitude, longitude, geofenceRadiusMeters = 100, timezone = 'UTC' } = req.body;
    const latNum = Number(latitude) || 12.9279;
    const lngNum = Number(longitude) || 77.6271;
    const radiusNum = Math.round(Number(geofenceRadiusMeters)) || 100;
    const cleanCode = (code || (name || 'OFF').slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90)).toUpperCase().trim();

    const result = await req.tenantQuery!(
      `INSERT INTO offices (name, code, address, latitude, longitude, geofence_radius_meters, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         address = EXCLUDED.address,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         geofence_radius_meters = EXCLUDED.geofence_radius_meters,
         timezone = EXCLUDED.timezone,
         is_active = true,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [name, cleanCode, address || name, latNum, lngNum, radiusNum, timezone]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getDepartments(req: Request, res: Response): Promise<void> {
  try {
    await ensureLeadTables(req.tenantQuery!);
    await ensureDepartmentShortCodes(req.tenantQuery!);
    const result = await req.tenantQuery!(
      `SELECT d.*, e.first_name || ' ' || e.last_name as lead_name,
              ${leadsJsonSql('department_leads', 'department_id', 'd.id')} as leads
       FROM departments d
       LEFT JOIN employees e ON d.lead_employee_id = e.id
       ORDER BY d.name ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createDepartment(req: Request, res: Response): Promise<void> {
  try {
    const { name, code, shortCode, description, leadEmployeeId, leadEmployeeIds } = req.body;
    const cleanCode = (code || (name || 'DEP').slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90)).toUpperCase().trim();
    const cleanDescription = description == null ? null : String(description).trim() || null;

    await ensureDepartmentShortCodes(req.tenantQuery!);
    let cleanShortCode = normalizeShortCode(shortCode);
    if (cleanShortCode) {
      const error = await validateShortCode(req.tenantQuery!, cleanShortCode);
      if (error) {
        res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
        return;
      }
    } else {
      const existing = await req.tenantQuery!(`SELECT LOWER(short_code) AS code FROM departments WHERE short_code IS NOT NULL`);
      cleanShortCode = uniqueShortCode(suggestShortCode(name), new Set(existing.rows.map((r: any) => String(r.code))));
    }

    const result = await req.tenantQuery!(
      `INSERT INTO departments (name, code, short_code, description)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         description = COALESCE(EXCLUDED.description, departments.description)
       RETURNING *`,
      [name, cleanCode, cleanShortCode, cleanDescription]
    );
    const departmentId = String(result.rows[0].id);

    await applyLeadPayload(req, 'department', departmentId, {
      leadEmployeeIds,
      leadEmployeeId,
    });

    await syncReportingHierarchy(req.tenantQuery!);

    const leadIds = await getLeadIds(req.tenantQuery!, 'department', departmentId);
    res.status(201).json({
      success: true,
      data: { ...result.rows[0], lead_employee_id: leadIds[0] || null, lead_employee_ids: leadIds },
    });
  } catch (err: any) {
    if (err.code === '23505' && err.constraint === 'departments_name_uq') {
      res.status(409).json({ success: false, error: { code: 'DUPLICATE_DEPARTMENT', message: 'A department with this name already exists.' } });
      return;
    }
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getTeams(req: Request, res: Response): Promise<void> {
  try {
    const { departmentId } = req.query;
    await ensureLeadTables(req.tenantQuery!);
    let query = `
      SELECT t.*,
             d.name as department_name,
             e.first_name || ' ' || COALESCE(NULLIF(e.last_name, 'User'), e.last_name, '') as lead_name,
             e.id as lead_id,
             ${leadsJsonSql('team_leads', 'team_id', 't.id')} as leads
      FROM teams t
      JOIN departments d ON t.department_id = d.id
      LEFT JOIN employees e ON t.lead_employee_id = e.id`;
    const params: any[] = [];
    if (departmentId) {
      query += ` WHERE t.department_id = $1`;
      params.push(departmentId);
    }
    query += ` ORDER BY t.name ASC`;
    const result = await req.tenantQuery!(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createTeam(req: Request, res: Response): Promise<void> {
  try {
    const { departmentId, name, leadEmployeeId, leadEmployeeIds } = req.body;
    let validDeptId = departmentId;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!validDeptId || !UUID_REGEX.test(String(validDeptId).trim())) {
      const depCheck = await req.tenantQuery!('SELECT id FROM departments ORDER BY created_at ASC LIMIT 1');
      validDeptId = depCheck.rows[0]?.id;
    }

    if (!validDeptId) {
      const newDep = await req.tenantQuery!(
        `INSERT INTO departments (name, code) VALUES ('General Operations', 'GEN_OPS') ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name RETURNING id`
      );
      validDeptId = newDep.rows[0].id;
    }

    const result = await req.tenantQuery!(
      `INSERT INTO teams (department_id, name)
       VALUES ($1, $2)
       RETURNING *`,
      [validDeptId, name]
    );
    const teamId = String(result.rows[0].id);

    await applyLeadPayload(req, 'team', teamId, { leadEmployeeIds, leadEmployeeId });

    await syncReportingHierarchy(req.tenantQuery!);

    const leadIds = await getLeadIds(req.tenantQuery!, 'team', teamId);
    res.status(201).json({
      success: true,
      data: { ...result.rows[0], lead_employee_id: leadIds[0] || null, lead_employee_ids: leadIds },
    });
  } catch (err: any) {
    if (err.code === '23505' && err.constraint === 'teams_department_name_uq') {
      res.status(409).json({ success: false, error: { code: 'DUPLICATE_TEAM', message: 'This department already has a team with this name.' } });
      return;
    }
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getJobRoles(req: Request, res: Response): Promise<void> {
  try {
    const result = await req.tenantQuery!(
      `SELECT r.*, d.name as department_name 
       FROM job_roles r 
       LEFT JOIN departments d ON r.department_id = d.id 
       ORDER BY r.title ASC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createJobRole(req: Request, res: Response): Promise<void> {
  try {
    const { title, code, departmentId, level = 'L1' } = req.body;
    const cleanCode = (code || (title || 'ROLE').slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90)).toUpperCase().trim();

    const result = await req.tenantQuery!(
      `INSERT INTO job_roles (title, code, department_id, level)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET
         title = EXCLUDED.title,
         department_id = EXCLUDED.department_id,
         level = EXCLUDED.level
       RETURNING *`,
      [title, cleanCode, departmentId || null, level]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateOffice(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, address, latitude, longitude, geofenceRadiusMeters, timezone } = req.body;
    const result = await req.tenantQuery!(
      `UPDATE offices SET
         name = COALESCE($2, name),
         address = COALESCE($3, address),
         latitude = COALESCE($4, latitude),
         longitude = COALESCE($5, longitude),
         geofence_radius_meters = COALESCE($6, geofence_radius_meters),
         timezone = COALESCE($7, timezone),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [
        id,
        name || null,
        address || null,
        latitude != null ? Number(latitude) : null,
        longitude != null ? Number(longitude) : null,
        geofenceRadiusMeters != null ? Math.round(Number(geofenceRadiusMeters)) : null,
        timezone || null,
      ]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Office not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteOffice(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await req.tenantQuery!(
      `UPDATE offices SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Office not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateDepartment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, shortCode, description, leadEmployeeId, leadEmployeeIds } = req.body;
    await ensureDepartmentShortCodes(req.tenantQuery!);
    let cleanShortCode: string | null = null;
    if (shortCode !== undefined) {
      cleanShortCode = normalizeShortCode(shortCode);
      const error = await validateShortCode(req.tenantQuery!, cleanShortCode, id);
      if (error) {
        res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } });
        return;
      }
    }
    const descriptionProvided = description !== undefined;
    const cleanDescription = descriptionProvided ? String(description ?? '').trim() : null;
    const previous = await req.tenantQuery!(
      `SELECT lead_employee_id FROM departments WHERE id = $1 LIMIT 1`,
      [id]
    );
    const previousLead = previous.rows[0]?.lead_employee_id
      ? String(previous.rows[0].lead_employee_id)
      : null;
    const previousLeadIds = await getLeadIds(req.tenantQuery!, 'department', id);
    const result = await req.tenantQuery!(
      `UPDATE departments SET
         name = COALESCE($2, name),
         short_code = COALESCE($3, short_code),
         description = CASE WHEN $4::boolean THEN $5 ELSE description END
       WHERE id = $1 RETURNING *`,
      [id, name || null, cleanShortCode, descriptionProvided, cleanDescription]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Department not found' } });
      return;
    }

    await applyLeadPayload(req, 'department', id, { leadEmployeeIds, leadEmployeeId });

    await syncReportingHierarchy(req.tenantQuery!, {
      previousDeptLeads: { [id]: previousLead },
      previousLeadIds,
    });

    const leadIds = await getLeadIds(req.tenantQuery!, 'department', id);
    res.json({
      success: true,
      data: { ...result.rows[0], lead_employee_id: leadIds[0] || null, lead_employee_ids: leadIds },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteDepartment(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const inUse = await req.tenantQuery!(
      `SELECT COUNT(*)::int AS c FROM employees WHERE department_id = $1`,
      [id]
    );
    if ((inUse.rows[0]?.c || 0) > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'IN_USE', message: 'Department has assigned employees' },
      });
      return;
    }
    const result = await req.tenantQuery!(`DELETE FROM departments WHERE id = $1 RETURNING *`, [id]);
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Department not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateTeam(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, leadEmployeeId, leadEmployeeIds } = req.body;
    const previousLeadIds = await getLeadIds(req.tenantQuery!, 'team', id);
    const result = await req.tenantQuery!(
      `UPDATE teams SET
         name = COALESCE($2, name)
       WHERE id = $1 RETURNING *`,
      [id, name || null]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
      return;
    }

    await applyLeadPayload(req, 'team', id, { leadEmployeeIds, leadEmployeeId });

    await syncReportingHierarchy(req.tenantQuery!, { previousLeadIds });

    const leadIds = await getLeadIds(req.tenantQuery!, 'team', id);
    res.json({
      success: true,
      data: { ...result.rows[0], lead_employee_id: leadIds[0] || null, lead_employee_ids: leadIds },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteTeam(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await req.tenantQuery!(`DELETE FROM teams WHERE id = $1 RETURNING *`, [id]);
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateJobRole(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { title, departmentId, level } = req.body;
    const result = await req.tenantQuery!(
      `UPDATE job_roles SET
         title = COALESCE($2, title),
         department_id = COALESCE($3, department_id),
         level = COALESCE($4, level)
       WHERE id = $1 RETURNING *`,
      [id, title || null, departmentId || null, level || null]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job role not found' } });
      return;
    }
    if (level) {
      await syncEmployeesToJobLevel(req.tenantQuery!, id, result.rows[0].level);
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteJobRole(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const inUse = await req.tenantQuery!(
      `SELECT COUNT(*)::int AS c FROM employees WHERE job_role_id = $1`,
      [id]
    );
    if ((inUse.rows[0]?.c || 0) > 0) {
      res.status(409).json({
        success: false,
        error: { code: 'IN_USE', message: 'Job role has assigned employees' },
      });
      return;
    }
    const result = await req.tenantQuery!(`DELETE FROM job_roles WHERE id = $1 RETURNING *`, [id]);
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Job role not found' } });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function syncOrgReporting(req: Request, res: Response): Promise<void> {
  try {
    const result = await syncReportingHierarchy(req.tenantQuery!);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
