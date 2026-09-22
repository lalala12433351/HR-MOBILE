import { Request, Response } from 'express';
import { calculateLoggedHours, parseTimeToMinutes } from './attendance.schema.js';
import {
  applyEmployeeScopeFilter,
  canAccessEmployee,
  getAccessScope,
  isOrgWideRole,
  resolveCallerEmployee,
} from '../../utils/employeeScope.js';
import { withTenantContext } from '../../db/queryRunner.js';
import {
  adjustLeaveBalance,
  assertSufficientBalance,
  creditLeaveBalance,
  debitLeaveBalance,
  ensureLeaveBalance,
  ensureLeaveBalancesBatch,
  isDebitableLeaveType,
  serializeBalance,
  withTenantTransaction,
} from './leaveBalances.js';

// Haversine formula to determine distance in meters between user punch coordinates and office coordinates
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export async function recordPunch(req: Request, res: Response): Promise<void> {
  try {
    const {
      employeeId,
      officeId,
      punchType,
      latitude,
      longitude,
      deviceInfo,
      checkInTime,
      checkOutTime,
      attendanceStatus,
    } = req.body;

    // Non-admin users may only punch for themselves
    let validEmpId = employeeId;
    const me = await resolveCallerEmployee(req);
    if (!isOrgWideRole(req.user?.role)) {
      if (!me?.id) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record for punch' },
        });
        return;
      }
      validEmpId = me.id;
    } else {
      const empCheck = await req.tenantQuery!(
        `SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 OR email = $1 LIMIT 1`,
        [employeeId]
      );
      if (empCheck.rows[0]) {
        validEmpId = empCheck.rows[0].id;
      } else if (me?.id) {
        validEmpId = me.id;
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'EMPLOYEE_NOT_FOUND',
            message: 'Could not resolve employee for punch. Provide a valid employeeId.',
          },
        });
        return;
      }
    }

    // Resolve office: prefer request officeId → employee assigned/primary → oldest office
    let validOfficeId = officeId;
    let isWithinGeofence = true;
    let distanceMeters = 0;

    // Load employee's assigned offices (if any)
    let assignedOfficeIds: string[] = [];
    try {
      await req.tenantQuery!(`
        CREATE TABLE IF NOT EXISTS employee_offices (
          employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
          is_primary BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (employee_id, office_id)
        )
      `);
      const assignedRes = await req.tenantQuery!(
        `SELECT eo.office_id, eo.is_primary, e.office_id AS primary_office_id
         FROM employees e
         LEFT JOIN employee_offices eo ON eo.employee_id = e.id
         WHERE e.id = $1`,
        [validEmpId]
      );
      assignedOfficeIds = assignedRes.rows
        .map((r: any) => (r.office_id ? String(r.office_id) : null))
        .filter(Boolean) as string[];
      // Deduplicate
      assignedOfficeIds = Array.from(new Set(assignedOfficeIds));
    } catch {
      // Junction table may be unavailable; fall through to legacy resolution
    }

    let office: any = null;
    if (officeId) {
      const officeRes = await req.tenantQuery!(
        `SELECT * FROM offices WHERE (id::text = $1 OR code = $1) AND is_active = true LIMIT 1`,
        [officeId]
      );
      office = officeRes.rows[0] || null;

      // If employee has assignments, requested office must be in that set
      if (office && assignedOfficeIds.length > 0 && !assignedOfficeIds.includes(String(office.id))) {
        res.status(403).json({
          success: false,
          error: {
            code: 'OFFICE_NOT_ASSIGNED',
            message: 'You are not assigned to this office. Choose one of your assigned offices.',
          },
        });
        return;
      }
    }

    if (!office && assignedOfficeIds.length > 0) {
      // Prefer primary assigned office
      const primaryRes = await req.tenantQuery!(
        `SELECT o.* FROM employee_offices eo
         JOIN offices o ON o.id = eo.office_id
         WHERE eo.employee_id = $1 AND eo.is_primary = true AND o.is_active = true
         LIMIT 1`,
        [validEmpId]
      );
      office = primaryRes.rows[0] || null;
      if (!office) {
        const firstAssigned = await req.tenantQuery!(
          `SELECT o.* FROM employee_offices eo
           JOIN offices o ON o.id = eo.office_id
           WHERE eo.employee_id = $1 AND o.is_active = true
           ORDER BY o.name ASC LIMIT 1`,
          [validEmpId]
        );
        office = firstAssigned.rows[0] || null;
      }
    }

    if (!office) {
      // Legacy: employee's office_id, then oldest office
      const empOffice = await req.tenantQuery!(
        `SELECT o.* FROM employees e
         JOIN offices o ON o.id = e.office_id
         WHERE e.id = $1 AND o.is_active = true LIMIT 1`,
        [validEmpId]
      );
      office = empOffice.rows[0] || null;
    }

    if (!office) {
      const fallbackOffice = await req.tenantQuery!(
        `SELECT * FROM offices WHERE is_active = true ORDER BY created_at ASC NULLS LAST LIMIT 1`
      );
      office = fallbackOffice.rows[0] || null;
    }
    if (!office) {
      res.status(400).json({
        success: false,
        error: {
          code: 'OFFICE_NOT_CONFIGURED',
          message: 'No office is configured. Set up an office with coordinates before punching.',
        },
      });
      return;
    }

    const latRaw = latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : NaN;
    const lngRaw = longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : NaN;
    if (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'LOCATION_REQUIRED',
          message: 'Device latitude and longitude are required to record a punch.',
        },
      });
      return;
    }
    const latNum = latRaw;
    const lngNum = lngRaw;
    const validPunchType = String(punchType).toLowerCase().trim() === 'check_out' ? 'check_out' : 'check_in';

    validOfficeId = office.id;
    const officeLat = Number(office.latitude);
    const officeLng = Number(office.longitude);
    if (!Number.isFinite(officeLat) || !Number.isFinite(officeLng)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'OFFICE_COORDS_MISSING',
          message: 'Office is missing latitude/longitude. Update the office location in settings.',
        },
      });
      return;
    }
    distanceMeters = calculateDistanceMeters(latNum, lngNum, officeLat, officeLng);
    isWithinGeofence = distanceMeters <= (office.geofence_radius_meters || 100);

    const ipAddress = req.ip || req.socket?.remoteAddress || '127.0.0.1';

    // Calculate server-derived logged hours if checkIn and checkOut timestamps provided
    let loggedHours = 0;
    if (checkInTime && checkOutTime) {
      loggedHours = calculateLoggedHours(checkInTime, checkOutTime);
    }

    // Authoritative attendance status determination
    let statusEnum = 'PRESENT';
    if (attendanceStatus) {
      statusEnum = String(attendanceStatus).toUpperCase();
    } else if (loggedHours > 0) {
      statusEnum = loggedHours >= 7.5 ? 'PRESENT' : loggedHours >= 3.5 ? 'HALF_DAY' : 'PRESENT';
    }

    const result = await req.tenantQuery!(
      `INSERT INTO attendance_punches (
        employee_id, office_id, punch_type, latitude, longitude, distance_from_office_meters, is_within_geofence, device_info, ip_address
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [validEmpId, validOfficeId, validPunchType, latNum, lngNum, distanceMeters, isWithinGeofence, deviceInfo || null, ipAddress]
    );

    res.status(201).json({
      success: true,
      data: {
        ...result.rows[0],
        checkInTime: checkInTime || null,
        checkOutTime: checkOutTime || null,
        loggedHours,
        attendanceStatus: statusEnum,
      },
      geofence: {
        isWithinGeofence,
        distanceMeters,
        officeName: office?.name || 'Office',
      },
    });
  } catch (err: any) {
    console.error('Error recording punch:', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getPunches(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, date } = req.query;
    const scope = await getAccessScope(req);
    let sql = `
      SELECT 
        p.*,
        p.punch_timestamp as punch_time,
        e.first_name || ' ' || e.last_name as employee_name,
        e.employee_code,
        o.name as office_name
      FROM attendance_punches p
      JOIN employees e ON p.employee_id = e.id
      LEFT JOIN offices o ON p.office_id = o.id
      WHERE 1=1
    `;
    const params: any[] = [];
    sql = applyEmployeeScopeFilter(scope, sql, params, 'p.employee_id');

    if (employeeId) {
      const access = await canAccessEmployee(req, String(employeeId));
      if (!access.ok || !access.target) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have access to punches for this employee' },
        });
        return;
      }
      params.push(access.target.id);
      sql += ` AND p.employee_id = $${params.length}`;
    }
    if (date) {
      params.push(date);
      sql += ` AND DATE(p.punch_timestamp) = $${params.length}`;
    }

    sql += ` ORDER BY p.punch_timestamp DESC LIMIT 200`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function requestLeave(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, leaveType, startDate, endDate, daysCount, reason } = req.body;

    let validEmpId = employeeId;
    const me = await resolveCallerEmployee(req);
    if (!isOrgWideRole(req.user?.role)) {
      if (!me?.id) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record for leave' },
        });
        return;
      }

      const access = await canAccessEmployee(req, String(employeeId));
      if (!access.ok || !access.target) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have access to request leave for this employee' },
        });
        return;
      }

      const isSelf = String(access.target.id) === String(me.id);
      const isDirectReport = String(access.target.reporting_manager_id || '') === String(me.id);
      if (!isSelf && !isDirectReport) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Managers may only request leave for themselves or direct reports' },
        });
        return;
      }
      validEmpId = access.target.id;
    } else {
      const empCheck = await req.tenantQuery!(
        `SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 LIMIT 1`,
        [employeeId]
      );
      if (empCheck.rows[0]) validEmpId = empCheck.rows[0].id;
      else if (me?.id) validEmpId = me.id;
    }

    const validLeaveType = ['casual', 'sick', 'earned', 'unpaid', 'wfh'].includes(
      String(leaveType).toLowerCase().trim()
    )
      ? String(leaveType).toLowerCase().trim()
      : 'casual';
    const daysCountNum = Math.max(0.5, Number(daysCount) || 1.0);
    const validStart = startDate || new Date().toISOString().split('T')[0];
    const validEnd = endDate || validStart;
    const year = Number(String(validStart).slice(0, 4)) || new Date().getFullYear();

    if (!req.dbSchema) {
      res.status(400).json({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing tenant schema' } });
      return;
    }

    try {
      const result = await withTenantTransaction(req.dbSchema, async (query) => {
        await assertSufficientBalance(query, validEmpId, validLeaveType, daysCountNum, year);
        const insertRes = await query(
          `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending')
           RETURNING *`,
          [validEmpId, validLeaveType, validStart, validEnd, daysCountNum, reason || 'Personal Leave']
        );
        return insertRes.rows[0];
      });
      res.status(201).json({ success: true, data: result });
    } catch (balErr: any) {
      if (balErr?.code === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_BALANCE',
            message: balErr.message,
            remaining: balErr.remaining,
            pending: balErr.pending,
            requested: balErr.requested,
          },
        });
        return;
      }
      throw balErr;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function decideLeave(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, decisionNotes } = req.body;
    const forceUnpaid = req.body?.approveAsLop === true || req.body?.leaveType === 'unpaid';

    if (!req.dbSchema) {
      res.status(400).json({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing tenant schema' } });
      return;
    }

    const me = await resolveCallerEmployee(req);

    try {
      const updated = await withTenantTransaction(req.dbSchema, async (query) => {
        const leaveRes = await query(
          `SELECT l.*, e.reporting_manager_id, e.role as employee_role
           FROM leave_requests l
           JOIN employees e ON l.employee_id = e.id
           WHERE l.id = $1
           LIMIT 1`,
          [id]
        );
        if (leaveRes.rows.length === 0) {
          throw Object.assign(new Error('Leave request not found'), { code: 'NOT_FOUND' });
        }

        const leave = leaveRes.rows[0];

        if (!isOrgWideRole(req.user?.role)) {
          if (!me?.id) {
            throw Object.assign(new Error('Unable to resolve your employee record'), { code: 'FORBIDDEN' });
          }
          if (String(leave.employee_id) === String(me.id)) {
            throw Object.assign(new Error('You cannot approve your own leave request'), { code: 'FORBIDDEN' });
          }
          const isDirectReport = String(leave.reporting_manager_id || '') === String(me.id);
          if (!isDirectReport) {
            throw Object.assign(new Error('You can only decide leave for your direct reports'), { code: 'FORBIDDEN' });
          }
        }

        const validStatus =
          String(status).toLowerCase().trim() === 'approved'
            ? 'approved'
            : String(status).toLowerCase().trim() === 'rejected'
              ? 'rejected'
              : 'pending';

        const nextLeaveType =
          validStatus === 'approved' && forceUnpaid ? 'unpaid' : String(leave.leave_type);

        const prevStatus = String(leave.status);
        const result = await query(
          `UPDATE leave_requests
           SET status = $1, decision_notes = $2, leave_type = $3, updated_at = CURRENT_TIMESTAMP
           WHERE id = $4
           RETURNING *`,
          [validStatus, decisionNotes || null, nextLeaveType, id]
        );
        const row = result.rows[0];

        // Debit only when transitioning into approved for debitable types
        if (validStatus === 'approved' && prevStatus !== 'approved' && isDebitableLeaveType(nextLeaveType)) {
          const year = Number(String(leave.start_date).slice(0, 4)) || new Date().getFullYear();
          await debitLeaveBalance(query, {
            employeeId: leave.employee_id,
            leaveType: nextLeaveType,
            daysCount: Number(leave.days_count) || 1,
            leaveRequestId: leave.id,
            actorId: me?.id || null,
            year,
          });
        }

        return row;
      });

      res.json({ success: true, data: updated });
    } catch (inner: any) {
      if (inner?.code === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: inner.message } });
        return;
      }
      if (inner?.code === 'FORBIDDEN') {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: inner.message } });
        return;
      }
      if (inner?.code === 'INSUFFICIENT_BALANCE') {
        res.status(400).json({
          success: false,
          error: { code: 'INSUFFICIENT_BALANCE', message: inner.message, remaining: inner.remaining },
        });
        return;
      }
      throw inner;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getLeaves(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, status } = req.query;
    const scope = await getAccessScope(req);
    let sql = `
      SELECT 
        l.*,
        e.first_name || ' ' || e.last_name as employee_name,
        e.employee_code,
        d.name as department_name
      FROM leave_requests l
      JOIN employees e ON l.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params: any[] = [];
    sql = applyEmployeeScopeFilter(scope, sql, params, 'l.employee_id');

    if (employeeId) {
      const access = await canAccessEmployee(req, String(employeeId));
      if (!access.ok || !access.target) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have access to leaves for this employee' },
        });
        return;
      }
      params.push(access.target.id);
      sql += ` AND l.employee_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND l.status = $${params.length}`;
    }

    sql += ` ORDER BY l.created_at DESC LIMIT 200`;

    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

const holidaysTableEnsured = new Set<string>();

async function ensureHolidaysTable(req: Request): Promise<void> {
  const schema = req.dbSchema || req.tenant?.schema || '';
  if (schema && holidaysTableEnsured.has(schema)) return;

  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS holidays (
      id VARCHAR(128) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      holiday_date DATE NOT NULL,
      year INT NOT NULL,
      day_of_week VARCHAR(32),
      is_approved BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await req.tenantQuery!(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_holidays_date ON holidays(holiday_date)
  `);

  if (schema) holidaysTableEnsured.add(schema);
}

function mapHolidayRow(row: any) {
  const rawDate = row.holiday_date ?? row.date;
  let dateStr = '';
  if (typeof rawDate === 'string') {
    dateStr = rawDate.slice(0, 10);
  } else if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    dateStr = rawDate.toISOString().slice(0, 10);
  }

  return {
    id: row.id,
    name: row.name,
    date: dateStr,
    year: Number(row.year),
    dayOfWeek: row.day_of_week || row.dayOfWeek || '',
    isApproved: row.is_approved !== false && row.isApproved !== false,
  };
}

export async function getHolidays(req: Request, res: Response): Promise<void> {
  try {
    await ensureHolidaysTable(req);
    const { year } = req.query;
    let sql = `SELECT id, name, holiday_date::text AS holiday_date, year, day_of_week, is_approved
               FROM holidays`;
    const params: any[] = [];
    if (year) {
      params.push(Number(year));
      sql += ` WHERE year = $1`;
    }
    sql += ` ORDER BY holiday_date ASC`;
    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows.map(mapHolidayRow) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function saveHolidays(req: Request, res: Response): Promise<void> {
  try {
    await ensureHolidaysTable(req);
    const holidays = Array.isArray(req.body?.holidays) ? req.body.holidays : [];

    const byDate = new Map<string, any>();
    for (const h of holidays) {
      if (!h?.date || !h?.name) continue;
      byDate.set(String(h.date).slice(0, 10), h);
    }
    const list = Array.from(byDate.values());
    const schema = req.dbSchema;
    if (!schema) {
      res.status(400).json({
        success: false,
        error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant schema required' },
      });
      return;
    }

    const saved = await withTenantContext(schema, async (client, query) => {
      await client.query('BEGIN');
      try {
        await query(`DELETE FROM holidays`);
        if (list.length === 0) {
          await client.query('COMMIT');
          return [];
        }

        const ids = list.map((h) => String(h.id || `hol_${h.date}_${Date.now()}`).slice(0, 128));
        const names = list.map((h) => String(h.name).slice(0, 255));
        const dates = list.map((h) => String(h.date).slice(0, 10));
        const years = list.map((h) => Number(h.year) || Number(String(h.date).slice(0, 4)));
        const days = list.map((h) => String(h.dayOfWeek || '').slice(0, 32));
        const approved = list.map((h) => h.isApproved !== false);

        const result = await query(
          `INSERT INTO holidays (id, name, holiday_date, year, day_of_week, is_approved)
           SELECT * FROM UNNEST(
             $1::varchar[],
             $2::varchar[],
             $3::date[],
             $4::int[],
             $5::varchar[],
             $6::boolean[]
           )
           RETURNING id, name, holiday_date::text AS holiday_date, year, day_of_week, is_approved`,
          [ids, names, dates, years, days, approved]
        );
        await client.query('COMMIT');
        return result.rows.map(mapHolidayRow);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });

    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

function normalizeLeaveDecisionStatus(raw: unknown): 'approved' | 'rejected' | null {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'approved') return 'approved';
  if (s === 'rejected') return 'rejected';
  return null;
}

/** Alias of decideLeave that accepts FE title-case Approved/Rejected. */
export async function updateLeaveStatus(req: Request, res: Response): Promise<void> {
  const mapped = normalizeLeaveDecisionStatus(req.body?.status);
  if (!mapped) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_STATUS', message: 'status must be Approved or Rejected' },
    });
    return;
  }
  req.body = {
    ...req.body,
    status: mapped,
    decisionNotes: req.body?.decisionNotes || req.body?.approvedBy || null,
  };
  return decideLeave(req, res);
}

export async function bulkUpdateLeaveStatus(req: Request, res: Response): Promise<void> {
  try {
    const leaveIds: string[] = Array.isArray(req.body?.leaveIds) ? req.body.leaveIds : [];
    const mapped = normalizeLeaveDecisionStatus(req.body?.status);
    if (!mapped || leaveIds.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'leaveIds and Approved/Rejected status are required' },
      });
      return;
    }

    if (!req.dbSchema) {
      res.status(400).json({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing tenant schema' } });
      return;
    }

    const decisionNotes = req.body?.decisionNotes || req.body?.approvedBy || null;
    const forceUnpaid = req.body?.approveAsLop === true || req.body?.leaveType === 'unpaid';
    const me = await resolveCallerEmployee(req);
    const updated: any[] = [];

    for (const id of leaveIds) {
      try {
        const row = await withTenantTransaction(req.dbSchema, async (query) => {
          const leaveRes = await query(
            `SELECT l.*, e.reporting_manager_id
             FROM leave_requests l
             JOIN employees e ON l.employee_id = e.id
             WHERE l.id = $1 LIMIT 1`,
            [id]
          );
          if (leaveRes.rows.length === 0) return null;

          const leave = leaveRes.rows[0];
          if (!isOrgWideRole(req.user?.role)) {
            if (!me?.id) return null;
            if (String(leave.employee_id) === String(me.id)) return null;
            if (String(leave.reporting_manager_id || '') !== String(me.id)) return null;
          }

          const nextLeaveType = mapped === 'approved' && forceUnpaid ? 'unpaid' : String(leave.leave_type);
          const prevStatus = String(leave.status);
          const result = await query(
            `UPDATE leave_requests
             SET status = $1, decision_notes = $2, leave_type = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING *`,
            [mapped, decisionNotes, nextLeaveType, id]
          );
          const out = result.rows[0];

          if (mapped === 'approved' && prevStatus !== 'approved' && isDebitableLeaveType(nextLeaveType)) {
            const year = Number(String(leave.start_date).slice(0, 4)) || new Date().getFullYear();
            await debitLeaveBalance(query, {
              employeeId: leave.employee_id,
              leaveType: nextLeaveType,
              daysCount: Number(leave.days_count) || 1,
              leaveRequestId: leave.id,
              actorId: me?.id || null,
              year,
            });
          }
          return out;
        });
        if (row) updated.push(row);
      } catch {
        // Skip unauthorized / insufficient-balance IDs in bulk
      }
    }

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deleteLeave(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!req.dbSchema) {
      res.status(400).json({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing tenant schema' } });
      return;
    }

    const me = await resolveCallerEmployee(req);

    try {
      const row = await withTenantTransaction(req.dbSchema, async (query) => {
        const leaveRes = await query(`SELECT * FROM leave_requests WHERE id = $1 LIMIT 1`, [id]);
        if (leaveRes.rows.length === 0) {
          throw Object.assign(new Error('Leave request not found'), { code: 'NOT_FOUND' });
        }

        const leave = leaveRes.rows[0];
        const isOwner = me?.id && String(leave.employee_id) === String(me.id);
        if (!isOrgWideRole(req.user?.role) && !isOwner) {
          throw Object.assign(new Error('You can only cancel your own leave requests'), { code: 'FORBIDDEN' });
        }

        if (String(leave.status) !== 'pending' && !isOrgWideRole(req.user?.role)) {
          throw Object.assign(new Error('Only pending leave requests can be cancelled'), { code: 'NOT_PENDING' });
        }

        const prevStatus = String(leave.status);
        const result = await query(
          `UPDATE leave_requests
           SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING *`,
          [id]
        );

        if (prevStatus === 'approved' && isDebitableLeaveType(String(leave.leave_type))) {
          const year = Number(String(leave.start_date).slice(0, 4)) || new Date().getFullYear();
          await creditLeaveBalance(query, {
            employeeId: leave.employee_id,
            leaveType: String(leave.leave_type),
            daysCount: Number(leave.days_count) || 1,
            leaveRequestId: leave.id,
            actorId: me?.id || null,
            year,
          });
        }

        return result.rows[0];
      });

      res.json({ success: true, data: row });
    } catch (inner: any) {
      if (inner?.code === 'NOT_FOUND') {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: inner.message } });
        return;
      }
      if (inner?.code === 'FORBIDDEN') {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: inner.message } });
        return;
      }
      if (inner?.code === 'NOT_PENDING') {
        res.status(400).json({ success: false, error: { code: 'NOT_PENDING', message: inner.message } });
        return;
      }
      throw inner;
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getLeaveBalances(req: Request, res: Response): Promise<void> {
  try {
    const employeeId = req.query.employeeId ? String(req.query.employeeId) : undefined;
    const year = req.query.year ? Number(req.query.year) : new Date().getFullYear();
    const me = await resolveCallerEmployee(req);

    if (employeeId) {
      const access = await canAccessEmployee(req, employeeId);
      if (!access.ok || !access.target) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have access to leave balances for this employee' },
        });
        return;
      }
      const bal = await ensureLeaveBalance(req.tenantQuery!, access.target.id, year, me?.id);
      res.json({ success: true, data: serializeBalance(bal) });
      return;
    }

    const scope = await getAccessScope(req);
    let sql = `SELECT id FROM employees WHERE COALESCE(account_status, '') <> 'Deactivated'`;
    const params: any[] = [];
    sql = applyEmployeeScopeFilter(scope, sql, params, 'id');
    sql += ` ORDER BY created_at ASC LIMIT 500`;
    const emps = await req.tenantQuery!(sql, params);
    const balances = await ensureLeaveBalancesBatch(
      req.tenantQuery!,
      emps.rows.map((emp: any) => String(emp.id)),
      year,
      me?.id
    );
    res.json({ success: true, data: balances.map(serializeBalance) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function postAdjustLeaveBalance(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, leaveType, delta, notes, year } = req.body;
    const access = await canAccessEmployee(req, String(employeeId));
    if (!access.ok || !access.target) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to adjust leave balances for this employee' },
      });
      return;
    }

    if (!req.dbSchema) {
      res.status(400).json({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing tenant schema' } });
      return;
    }

    const me = await resolveCallerEmployee(req);
    const y = year || new Date().getFullYear();
    const bal = await withTenantTransaction(req.dbSchema, async (query) => {
      return adjustLeaveBalance(query, {
        employeeId: access.target.id,
        leaveType,
        delta: Number(delta) || 0,
        notes,
        actorId: me?.id || null,
        year: y,
      });
    });

    res.json({ success: true, data: serializeBalance(bal) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

function parseTimeToSqlTime(timeStr: string | undefined | null): string | null {
  if (!timeStr) return null;
  const mins = parseTimeToMinutes(String(timeStr));
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function combineDateAndTime(dateStr: string, timeStr: string): Date | null {
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, Math.floor(mins / 60), mins % 60, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

async function upsertDayPunches(
  req: Request,
  employeeId: string,
  dateStr: string,
  checkIn?: string | null,
  checkOut?: string | null
): Promise<void> {
  const officeRes = await req.tenantQuery!(`SELECT id, latitude, longitude FROM offices ORDER BY created_at ASC NULLS LAST LIMIT 1`);
  const office = officeRes.rows[0];
  const officeId = office?.id || null;
  const lat = Number(office?.latitude);
  const lng = Number(office?.longitude);
  const safeLat = Number.isFinite(lat) ? lat : 0;
  const safeLng = Number.isFinite(lng) ? lng : 0;

  await req.tenantQuery!(
    `DELETE FROM attendance_punches
     WHERE employee_id = $1 AND DATE(punch_timestamp) = $2::date`,
    [employeeId, dateStr]
  );

  if (checkIn) {
    const inTs = combineDateAndTime(dateStr, checkIn);
    if (inTs) {
      await req.tenantQuery!(
        `INSERT INTO attendance_punches (
          employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
          distance_from_office_meters, is_within_geofence, device_info, ip_address
         ) VALUES ($1, $2, 'check_in', $3, $4, $5, 0, true, 'Manual Edit', $6)`,
        [employeeId, officeId, inTs.toISOString(), safeLat, safeLng, req.ip || '127.0.0.1']
      );
    }
  }

  if (checkOut) {
    const outTs = combineDateAndTime(dateStr, checkOut);
    if (outTs) {
      await req.tenantQuery!(
        `INSERT INTO attendance_punches (
          employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
          distance_from_office_meters, is_within_geofence, device_info, ip_address
         ) VALUES ($1, $2, 'check_out', $3, $4, $5, 0, true, 'Manual Edit', $6)`,
        [employeeId, officeId, outTs.toISOString(), safeLat, safeLng, req.ip || '127.0.0.1']
      );
    }
  }
}

export async function getRegularizations(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, status } = req.query;
    const scope = await getAccessScope(req);
    let sql = `
      SELECT
        r.*,
        r.date::text AS date,
        e.first_name || ' ' || e.last_name AS employee_name,
        e.employee_code,
        d.name AS department_name,
        a.first_name || ' ' || a.last_name AS approver_name
      FROM attendance_regularizations r
      JOIN employees e ON r.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN employees a ON r.approver_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];
    sql = applyEmployeeScopeFilter(scope, sql, params, 'r.employee_id');

    if (employeeId) {
      const access = await canAccessEmployee(req, String(employeeId));
      if (!access.ok || !access.target) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have access to regularizations for this employee' },
        });
        return;
      }
      params.push(access.target.id);
      sql += ` AND r.employee_id = $${params.length}`;
    }
    if (status) {
      params.push(String(status).toLowerCase());
      sql += ` AND r.status = $${params.length}`;
    }

    sql += ` ORDER BY r.created_at DESC LIMIT 200`;
    const result = await req.tenantQuery!(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function requestRegularization(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, date, requestedCheckIn, requestedCheckOut, reason, remarks } = req.body;

    let validEmpId = employeeId;
    const me = await resolveCallerEmployee(req);
    if (!isOrgWideRole(req.user?.role)) {
      if (!me?.id) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record' },
        });
        return;
      }
      validEmpId = me.id;
    } else {
      const empCheck = await req.tenantQuery!(
        `SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 LIMIT 1`,
        [employeeId]
      );
      if (empCheck.rows[0]) validEmpId = empCheck.rows[0].id;
      else if (me?.id) validEmpId = me.id;
    }

    const inTime = parseTimeToSqlTime(requestedCheckIn);
    const outTime = parseTimeToSqlTime(requestedCheckOut);
    const reasonText = [reason, remarks].filter(Boolean).join(' — ').slice(0, 1000) || 'Regularization request';

    const result = await req.tenantQuery!(
      `INSERT INTO attendance_regularizations (
         employee_id, date, requested_check_in, requested_check_out, reason, status
       ) VALUES ($1, $2::date, $3::time, $4::time, $5, 'pending')
       RETURNING *, date::text AS date`,
      [validEmpId, date, inTime, outTime, reasonText]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateRegularizationStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const mapped = normalizeLeaveDecisionStatus(req.body?.status);
    if (!mapped) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'status must be Approved or Rejected' },
      });
      return;
    }

    const regRes = await req.tenantQuery!(
      `SELECT r.*, r.date::text AS date_str, e.reporting_manager_id
       FROM attendance_regularizations r
       JOIN employees e ON r.employee_id = e.id
       WHERE r.id = $1 LIMIT 1`,
      [id]
    );
    if (regRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Regularization not found' } });
      return;
    }

    const reg = regRes.rows[0];
    const me = await resolveCallerEmployee(req);

    if (!isOrgWideRole(req.user?.role)) {
      if (!me?.id) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Unable to resolve employee' } });
        return;
      }
      if (String(reg.employee_id) === String(me.id)) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You cannot approve your own regularization' },
        });
        return;
      }
      if (String(reg.reporting_manager_id || '') !== String(me.id)) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only decide regularizations for your direct reports' },
        });
        return;
      }
    }

    const result = await req.tenantQuery!(
      `UPDATE attendance_regularizations
       SET status = $1, approver_id = $2
       WHERE id = $3
       RETURNING *, date::text AS date`,
      [mapped, me?.id || null, id]
    );

    if (mapped === 'approved') {
      const dateStr = String(reg.date_str || reg.date).slice(0, 10);
      const checkIn = reg.requested_check_in
        ? String(reg.requested_check_in).slice(0, 8)
        : null;
      const checkOut = reg.requested_check_out
        ? String(reg.requested_check_out).slice(0, 8)
        : null;
      // Convert TIME "HH:MM:SS" to displayable for upsert helper
      await upsertDayPunches(req, reg.employee_id, dateStr, checkIn, checkOut);
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateAttendanceRecord(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { employeeId, date, checkIn, checkOut } = req.body;

    let empId = employeeId;
    let dateStr = date ? String(date).slice(0, 10) : null;

    // Prefer resolving from an existing punch id (aggregator uses first check-in punch id)
    const punchRes = await req.tenantQuery!(
      `SELECT employee_id, DATE(punch_timestamp)::text AS punch_date
       FROM attendance_punches WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (punchRes.rows[0]) {
      empId = punchRes.rows[0].employee_id;
      dateStr = punchRes.rows[0].punch_date;
    }

    if (!empId || !dateStr) {
      res.status(400).json({
        success: false,
        error: {
          code: 'RESOLVE_FAILED',
          message: 'Could not resolve attendance record. Provide a valid punch id or employeeId + date.',
        },
      });
      return;
    }

    const access = await canAccessEmployee(req, String(empId));
    if (!access.ok || !access.target) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to edit this attendance record' },
      });
      return;
    }

    // Non-admins may only edit their own unless org-wide
    const me = await resolveCallerEmployee(req);
    if (!isOrgWideRole(req.user?.role)) {
      if (!me?.id || String(access.target.id) !== String(me.id)) {
        // Managers: allow if direct report
        const emp = await req.tenantQuery!(
          `SELECT reporting_manager_id FROM employees WHERE id = $1`,
          [access.target.id]
        );
        if (!me?.id || String(emp.rows[0]?.reporting_manager_id || '') !== String(me.id)) {
          res.status(403).json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'You cannot edit this attendance record' },
          });
          return;
        }
      }
    }

    await upsertDayPunches(
      req,
      access.target.id,
      dateStr,
      checkIn || null,
      checkOut || null
    );

    res.json({
      success: true,
      data: {
        id,
        employeeId: access.target.id,
        date: dateStr,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        status: req.body?.status || null,
        workingHours: req.body?.workingHours ?? null,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

const breaksTableEnsured = new Set<string>();

async function ensureBreaksTable(req: Request): Promise<void> {
  const schema = req.dbSchema || req.tenant?.schema || '';
  if (schema && breaksTableEnsured.has(schema)) return;

  await req.tenantQuery!(`
    CREATE TABLE IF NOT EXISTS attendance_breaks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      break_date DATE NOT NULL DEFAULT CURRENT_DATE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMPTZ,
      break_type VARCHAR(32),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await req.tenantQuery!(`
    CREATE INDEX IF NOT EXISTS idx_attendance_breaks_emp_date
    ON attendance_breaks(employee_id, break_date)
  `);

  if (schema) breaksTableEnsured.add(schema);
}

export async function toggleBreak(req: Request, res: Response): Promise<void> {
  try {
    await ensureBreaksTable(req);
    const { employeeId, isOnBreak, breakType } = req.body;

    let validEmpId = employeeId;
    const me = await resolveCallerEmployee(req);
    if (!isOrgWideRole(req.user?.role)) {
      if (!me?.id) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record' },
        });
        return;
      }
      validEmpId = me.id;
    } else {
      const empCheck = await req.tenantQuery!(
        `SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 LIMIT 1`,
        [employeeId]
      );
      if (empCheck.rows[0]) validEmpId = empCheck.rows[0].id;
      else if (me?.id) validEmpId = me.id;
    }

    const today = new Date().toISOString().slice(0, 10);

    if (isOnBreak) {
      const result = await req.tenantQuery!(
        `INSERT INTO attendance_breaks (employee_id, break_date, started_at, break_type)
         VALUES ($1, $2::date, CURRENT_TIMESTAMP, $3)
         RETURNING *`,
        [validEmpId, today, breakType || 'General']
      );
      res.status(201).json({ success: true, data: result.rows[0] });
      return;
    }

    const open = await req.tenantQuery!(
      `SELECT id FROM attendance_breaks
       WHERE employee_id = $1 AND break_date = $2::date AND ended_at IS NULL
       ORDER BY started_at DESC LIMIT 1`,
      [validEmpId, today]
    );

    if (open.rows[0]) {
      const result = await req.tenantQuery!(
        `UPDATE attendance_breaks SET ended_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [open.rows[0].id]
      );
      res.json({ success: true, data: result.rows[0] });
      return;
    }

    res.json({ success: true, data: { employeeId: validEmpId, isOnBreak: false } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

