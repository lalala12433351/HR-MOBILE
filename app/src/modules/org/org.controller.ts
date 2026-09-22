import { Request, Response } from 'express';
import { promoteEmployeeToManager } from '../../utils/roles.js';

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
    const result = await req.tenantQuery!(
      `SELECT d.*, e.first_name || ' ' || e.last_name as lead_name
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
    const { name, code, leadEmployeeId } = req.body;
    const cleanCode = (code || (name || 'DEP').slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90)).toUpperCase().trim();

    const result = await req.tenantQuery!(
      `INSERT INTO departments (name, code, lead_employee_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         lead_employee_id = EXCLUDED.lead_employee_id
       RETURNING *`,
      [name, cleanCode, leadEmployeeId || null]
    );

    if (leadEmployeeId) {
      await promoteEmployeeToManager(req.tenantQuery!, leadEmployeeId);
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getTeams(req: Request, res: Response): Promise<void> {
  try {
    const { departmentId } = req.query;
    let query = `
      SELECT t.*,
             d.name as department_name,
             e.first_name || ' ' || COALESCE(NULLIF(e.last_name, 'User'), e.last_name, '') as lead_name,
             e.id as lead_id
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
    const { departmentId, name, leadEmployeeId } = req.body;
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
      `INSERT INTO teams (department_id, name, lead_employee_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [validDeptId, name, leadEmployeeId || null]
    );

    if (leadEmployeeId) {
      await promoteEmployeeToManager(req.tenantQuery!, leadEmployeeId);
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
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
    const { name, leadEmployeeId } = req.body;
    const result = await req.tenantQuery!(
      `UPDATE departments SET
         name = COALESCE($2, name),
         lead_employee_id = COALESCE($3, lead_employee_id)
       WHERE id = $1 RETURNING *`,
      [id, name || null, leadEmployeeId || null]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Department not found' } });
      return;
    }

    if (leadEmployeeId) {
      await promoteEmployeeToManager(req.tenantQuery!, leadEmployeeId);
    }

    res.json({ success: true, data: result.rows[0] });
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
    const { name, leadEmployeeId } = req.body;
    const result = await req.tenantQuery!(
      `UPDATE teams SET
         name = COALESCE($2, name),
         lead_employee_id = COALESCE($3, lead_employee_id)
       WHERE id = $1 RETURNING *`,
      [id, name || null, leadEmployeeId || null]
    );
    if (!result.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Team not found' } });
      return;
    }

    if (leadEmployeeId) {
      await promoteEmployeeToManager(req.tenantQuery!, leadEmployeeId);
    }

    res.json({ success: true, data: result.rows[0] });
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
