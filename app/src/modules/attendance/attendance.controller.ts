import { Request, Response } from 'express';
import { calculateLoggedHours, parseTimeToMinutes } from './attendance.schema.js';
import {
  applyEmployeeScopeFilter,
  canAccessEmployee,
  getAccessScope,
  getManageableEmployeeIds,
  isOrgWideRole,
  resolveCallerEmployee,
} from '../../utils/employeeScope.js';
import { withTenantContext } from '../../db/queryRunner.js';
import { isManagerOf } from '../../utils/orgLeads.js';
import {
  adjustLeaveBalance,
  assertSufficientBalance,
  creditLeaveBalance,
  debitLeaveBalance,
  ensureLeaveBalance,
  ensureLeaveBalancesBatch,
  isDebitableLeaveType,
  loadConsumedDaysBatch,
  serializeBalances,
  withTenantTransaction,
} from './leaveBalances.js';
import {
  assertLeaveRequestAllowed,
  ensureLeaveAttachmentColumn,
  loadLeavePolicy,
  nextLeaveDecision,
} from './leavePolicy.js';
import {
  applyAutoClockOut,
  assertClockingDeviceAllowed,
  clientIp,
  readAttendanceSession,
  recordPresencePing,
  submitMissedCheckoutTime,
  createOfficeQrToken,
  ensurePunchPhotoColumn,
  findOpenCheckIn,
  isRemoteAttendanceDevice,
  loadRegularizationRules,
  isGeofenceRequired,
  isIpAllowed,
  loadAttendancePolicy,
  officeAllowsQr,
  officePolicyFor,
  selfieLooksPresent,
  verifyOfficeQrToken,
} from './attendancePolicy.js';

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
      selfiePhoto,
      qrToken,
      workFromHome,
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

    const policy = await loadAttendancePolicy(req);
    try {
      await clearFutureWfhShiftCheckouts(req);
    } catch (clearErr) {
      console.warn('Future WFH checkout cleanup skipped:', clearErr);
    }
    try {
      await applyAutoClockOut(req, validEmpId, policy);
    } catch (autoErr) {
      console.warn('Auto clock-out skipped:', autoErr);
    }
    const hasSelfieColumn = await ensurePunchPhotoColumn(req);

    const ipAddress = clientIp(req) || '127.0.0.1';
    const isRemote =
      workFromHome === true ||
      String(deviceInfo || '').toLowerCase().includes('wfh') ||
      String(deviceInfo || '').toLowerCase().includes('remote');
    // Home networks are not on the office allowlist. WFH still files a regularization for the manager.
    if (!isRemote && !isIpAllowed(policy, ipAddress)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'IP_NOT_ALLOWED',
          message: 'This network is not on the office Wi-Fi allowlist. Connect to an approved network or ask HR to update Attendance Settings.',
        },
      });
      return;
    }
    const usedQr = Boolean(qrToken);
    if (usedQr) {
      if (!officeAllowsQr(policy, office)) {
        res.status(403).json({
          success: false,
          error: { code: 'QR_DISABLED', message: 'QR attendance is not enabled for this office.' },
        });
        return;
      }
      const qr = verifyOfficeQrToken(String(qrToken), String(req.tenant?.id || req.dbSchema || ''), office.id);
      if (!qr.ok) {
        res.status(400).json({
          success: false,
          error: { code: 'QR_INVALID', message: qr.message },
        });
        return;
      }
    }

    if (!isRemote) {
      const deviceGate = assertClockingDeviceAllowed(policy, office, req, usedQr);
      if (!deviceGate.ok) {
        res.status(403).json({
          success: false,
          error: { code: 'DEVICE_NOT_ALLOWED', message: deviceGate.message },
        });
        return;
      }
    }

    const latRaw = latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : NaN;
    const lngRaw = longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : NaN;
    const geofenceRequired = isGeofenceRequired(policy, office, isRemote) && !usedQr;
    const validPunchType = String(punchType).toLowerCase().trim() === 'check_out' ? 'check_out' : 'check_in';

    const selfieRequired =
      validPunchType === 'check_out' ? policy.requireSelfieCheckOut : policy.requireSelfieCheckIn;
    if (selfieRequired && !selfieLooksPresent(selfiePhoto)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'SELFIE_REQUIRED',
          message:
            validPunchType === 'check_out'
              ? 'A check-out selfie is required by attendance policy.'
              : 'A check-in selfie is required by attendance policy.',
        },
      });
      return;
    }

    validOfficeId = office.id;
    const officeLat = Number(office.latitude);
    const officeLng = Number(office.longitude);
    const officeHasCoords = Number.isFinite(officeLat) && Number.isFinite(officeLng);

    if (geofenceRequired && (!Number.isFinite(latRaw) || !Number.isFinite(lngRaw))) {
      res.status(400).json({
        success: false,
        error: {
          code: 'LOCATION_REQUIRED',
          message: 'Device latitude and longitude are required to record a punch.',
        },
      });
      return;
    }

    if (geofenceRequired && !officeHasCoords) {
      res.status(400).json({
        success: false,
        error: {
          code: 'OFFICE_COORDS_MISSING',
          message: 'Office is missing latitude/longitude. Update the office location in settings.',
        },
      });
      return;
    }

    const latNum = Number.isFinite(latRaw) ? latRaw : officeHasCoords ? officeLat : 0;
    const lngNum = Number.isFinite(lngRaw) ? lngRaw : officeHasCoords ? officeLng : 0;

    if (geofenceRequired && officeHasCoords) {
      const match = officePolicyFor(policy, office);
      const radius =
        Number(match?.radiusMeters) || Number(office.geofence_radius_meters) || policy.geofenceRadiusMeters || 100;
      distanceMeters = Math.min(999999.99, calculateDistanceMeters(latNum, lngNum, officeLat, officeLng));
      isWithinGeofence = distanceMeters <= radius;
      if (!isWithinGeofence && policy.outOfRadiusAction === 'Block') {
        res.status(403).json({
          success: false,
          error: {
            code: 'GEOFENCE_VIOLATION',
            message: `Punch blocked: you are ${distanceMeters}m from ${office.name || 'the office'} (limit ${radius}m).`,
            distanceMeters,
            radiusMeters: radius,
          },
        });
        return;
      }
    } else {
      distanceMeters = 0;
      isWithinGeofence = !isRemote;
    }

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

    const photo = selfieLooksPresent(selfiePhoto) ? String(selfiePhoto) : null;
    if (photo && !hasSelfieColumn) {
      res.status(500).json({
        success: false,
        error: {
          code: 'PHOTO_STORE_UNAVAILABLE',
          message: 'The punch photo could not be stored. Retry after the attendance database is updated.',
        },
      });
      return;
    }
    const result = hasSelfieColumn
      ? await req.tenantQuery!(
          `INSERT INTO attendance_punches (
            employee_id, office_id, punch_type, latitude, longitude, distance_from_office_meters, is_within_geofence, device_info, ip_address, selfie_photo
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [
            validEmpId,
            validOfficeId,
            validPunchType,
            latNum,
            lngNum,
            distanceMeters,
            isWithinGeofence,
            deviceInfo || null,
            ipAddress,
            photo,
          ]
        )
      : await req.tenantQuery!(
          `INSERT INTO attendance_punches (
            employee_id, office_id, punch_type, latitude, longitude, distance_from_office_meters, is_within_geofence, device_info, ip_address
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            validEmpId,
            validOfficeId,
            validPunchType,
            latNum,
            lngNum,
            distanceMeters,
            isWithinGeofence,
            deviceInfo || null,
            ipAddress,
          ]
        );

    const saved = result.rows[0] || {};
    const { selfie_photo: _omitSelfie, ...savedPublic } = saved;
    res.status(201).json({
      success: true,
      data: {
        ...savedPublic,
        hasSelfie: Boolean(_omitSelfie),
        checkInTime: checkInTime || null,
        checkOutTime: checkOutTime || null,
        loggedHours,
        attendanceStatus: statusEnum,
      },
      geofence: {
        isWithinGeofence,
        distanceMeters,
        officeName: office?.name || 'Office',
        enforced: geofenceRequired,
      },
    });
  } catch (err: any) {
    console.error('Error recording punch:', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getOfficeQrToken(req: Request, res: Response): Promise<void> {
  try {
    const policy = await loadAttendancePolicy(req);
    if (!policy.allowQrCodeAttendance) {
      res.status(403).json({
        success: false,
        error: { code: 'QR_DISABLED', message: 'QR attendance is disabled in Attendance Settings.' },
      });
      return;
    }

    const officeId = String(req.query.officeId || '');
    let office: any = null;
    if (officeId) {
      const officeRes = await req.tenantQuery!(
        `SELECT * FROM offices WHERE (id::text = $1 OR code = $1) AND is_active = true LIMIT 1`,
        [officeId]
      );
      office = officeRes.rows[0] || null;
    }
    if (!office) {
      const fallback = await req.tenantQuery!(
        `SELECT * FROM offices WHERE is_active = true ORDER BY created_at ASC NULLS LAST LIMIT 1`
      );
      office = fallback.rows[0] || null;
    }
    if (!office) {
      res.status(400).json({
        success: false,
        error: { code: 'OFFICE_NOT_CONFIGURED', message: 'No office is configured for QR attendance.' },
      });
      return;
    }
    if (!officeAllowsQr(policy, office)) {
      res.status(403).json({
        success: false,
        error: { code: 'QR_DISABLED', message: 'QR attendance is not enabled for this office.' },
      });
      return;
    }

    const issued = createOfficeQrToken(
      String(req.tenant?.id || req.dbSchema || ''),
      String(office.id),
      policy.qrRefreshIntervalSeconds
    );
    res.json({
      success: true,
      data: {
        ...issued,
        officeId: office.id,
        officeName: office.name,
        refreshSeconds: policy.qrRefreshIntervalSeconds,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function verifyWorkplaceLocation(req: Request, res: Response): Promise<void> {
  try {
    const me = await resolveCallerEmployee(req);
    if (!me?.id) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record.' },
      });
      return;
    }

    const lat = Number(req.body?.latitude);
    const lng = Number(req.body?.longitude);
    const accuracy = Number(req.body?.accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({
        success: false,
        error: { code: 'LOCATION_REQUIRED', message: 'Device latitude and longitude are required.' },
      });
      return;
    }

    const policy = await loadAttendancePolicy(req);
    try {
      await applyAutoClockOut(req, me.id, policy);
    } catch (autoErr) {
      console.warn('Auto clock-out skipped:', autoErr);
    }

    const open = await findOpenCheckIn(req, me.id);
    if (!open) {
      res.json({
        success: true,
        data: { clockedIn: false, clockedOut: false },
      });
      return;
    }

    if (isRemoteAttendanceDevice(open.device_info)) {
      res.json({
        success: true,
        data: { clockedIn: true, clockedOut: false, skipped: true, reason: 'remote' },
      });
      return;
    }

    const offices: any[] = [];
    const seen = new Set<string>();
    const pushOffice = (row: any) => {
      if (!row?.id) return;
      const id = String(row.id);
      if (seen.has(id)) return;
      seen.add(id);
      offices.push(row);
    };

    if (open.office_id) {
      const punchOffice = await req.tenantQuery!(
        `SELECT * FROM offices WHERE id = $1 AND is_active = true LIMIT 1`,
        [open.office_id]
      );
      pushOffice(punchOffice.rows[0]);
    }

    try {
      const assigned = await req.tenantQuery!(
        `SELECT o.* FROM employee_offices eo
         JOIN offices o ON o.id = eo.office_id
         WHERE eo.employee_id = $1 AND o.is_active = true`,
        [me.id]
      );
      assigned.rows.forEach(pushOffice);
    } catch {
      // Junction table may be missing on older tenants.
    }

    const workplaces = offices.filter((office) => {
      const officeLat = Number(office.latitude);
      const officeLng = Number(office.longitude);
      return Number.isFinite(officeLat) && Number.isFinite(officeLng) && officeLat !== 0 && officeLng !== 0;
    });

    if (workplaces.length === 0) {
      res.json({
        success: true,
        data: { clockedIn: true, clockedOut: false, skipped: true, reason: 'no_office_coords' },
      });
      return;
    }

    const gpsSlack = Number.isFinite(accuracy) ? Math.min(50, Math.max(0, accuracy)) : 0;
    let best: { office: any; distanceMeters: number; radius: number; within: boolean } | null = null;
    for (const office of workplaces) {
      const match = officePolicyFor(policy, office);
      const radius =
        Number(match?.radiusMeters) ||
        Number(office.geofence_radius_meters) ||
        policy.geofenceRadiusMeters ||
        150;
      const distanceMeters = Math.min(
        999999.99,
        calculateDistanceMeters(lat, lng, Number(office.latitude), Number(office.longitude))
      );
      const within = distanceMeters <= radius + gpsSlack;
      if (!best || distanceMeters < best.distanceMeters) {
        best = { office, distanceMeters, radius, within };
      }
      if (within) {
        best = { office, distanceMeters, radius, within };
        break;
      }
    }

    if (best?.within) {
      res.json({
        success: true,
        data: {
          clockedIn: true,
          clockedOut: false,
          isWithinGeofence: true,
          distanceMeters: best.distanceMeters,
          radiusMeters: best.radius,
          officeName: best.office.name || 'Office',
        },
      });
      return;
    }

    const distanceMeters = best?.distanceMeters || 0;
    const radiusMeters = best?.radius || policy.geofenceRadiusMeters || 150;
    const officeName = best?.office?.name || 'the office';
    const ipAddress = clientIp(req) || '127.0.0.1';

    await req.tenantQuery!(
      `INSERT INTO attendance_punches (
         employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
         distance_from_office_meters, is_within_geofence, device_info, ip_address
       ) VALUES ($1, $2, 'check_out', NOW(), $3, $4, $5, false, $6, $7)`,
      [
        open.employee_id,
        open.office_id,
        lat,
        lng,
        distanceMeters,
        'Auto Clock-Out · Left workplace',
        ipAddress,
      ]
    );

    res.json({
      success: true,
      data: {
        clockedIn: false,
        clockedOut: true,
        isWithinGeofence: false,
        distanceMeters,
        radiusMeters,
        officeName,
        message: `Clocked out because you are ${Math.round(distanceMeters)}m from ${officeName} (limit ${radiusMeters}m). Punch in again when you return.`,
      },
    });
  } catch (err: any) {
    console.error('Error verifying workplace location:', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getPunches(req: Request, res: Response): Promise<void> {
  try {
    const { employeeId, date } = req.query;
    const policy = await loadAttendancePolicy(req);
    try {
      await clearFutureWfhShiftCheckouts(req);
    } catch (clearErr) {
      console.warn('Future WFH checkout cleanup skipped:', clearErr);
    }
    const hasSelfieColumn = await ensurePunchPhotoColumn(req);
    const me = await resolveCallerEmployee(req);
    try {
      await applyAutoClockOut(req, me?.id, policy);
    } catch (autoErr) {
      console.warn('Auto clock-out skipped:', autoErr);
    }
    const scope = await getAccessScope(req);
    const includePhotos =
      Boolean(employeeId) &&
      (req.query.includePhotos === '1' || req.query.includePhotos === 'true');
    const selfieSelect = hasSelfieColumn
      ? includePhotos
        ? `p.selfie_photo, (p.selfie_photo IS NOT NULL AND length(p.selfie_photo) > 0) AS has_selfie,`
        : `(p.selfie_photo IS NOT NULL AND length(p.selfie_photo) > 0) AS has_selfie,`
      : `false AS has_selfie,`;
    let sql = `
      SELECT 
        p.id, p.employee_id, p.office_id, p.punch_type, p.punch_timestamp,
        p.latitude, p.longitude, p.distance_from_office_meters, p.is_within_geofence,
        p.device_info, p.ip_address,
        EXISTS (
          SELECT 1 FROM attendance_missed_checkouts m
          WHERE m.check_in_punch_id = p.id
        ) AS missed_checkout,
        ${selfieSelect}
        p.punch_timestamp as punch_time,
        TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')) as employee_name,
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
      params.push(String(date).slice(0, 10));
      // Include a day on either side so a UTC database date still matches the viewer's local day.
      sql += includePhotos
        ? ` AND p.punch_timestamp >= ($${params.length}::date - INTERVAL '1 day') AND p.punch_timestamp < ($${params.length}::date + INTERVAL '2 days')`
        : ` AND DATE(p.punch_timestamp) = $${params.length}::date`;
    }

    if (!employeeId && !date) {
      // Daily boards need the whole recent window. A 200-row cap dropped
      // earlier check-ins once enough later punches existed, so someone
      // still clocked in looked absent.
      sql += ` AND p.punch_timestamp >= (NOW() - INTERVAL '120 days')`;
    }

    sql += employeeId
      ? ` ORDER BY p.punch_timestamp DESC LIMIT 500`
      : ` ORDER BY p.punch_timestamp DESC LIMIT 20000`;

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
      const isDirectReport =
        !isSelf && (await isManagerOf(req.tenantQuery!, String(me.id), String(access.target.id)));
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
    const attachmentUrl = String(req.body?.attachmentUrl || '').trim() || null;

    if (!req.dbSchema) {
      res.status(400).json({ success: false, error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Missing tenant schema' } });
      return;
    }

    try {
      const result = await withTenantTransaction(req.dbSchema, async (query) => {
        await ensureLeaveAttachmentColumn(query);
        await assertLeaveRequestAllowed(query, {
          employeeId: validEmpId,
          leaveType: validLeaveType,
          daysCount: daysCountNum,
          attachmentUrl,
        });
        await assertSufficientBalance(query, validEmpId, validLeaveType, daysCountNum, year);
        const insertRes = await query(
          `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_count, reason, status, attachment_url)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
           RETURNING *`,
          [validEmpId, validLeaveType, validStart, validEnd, daysCountNum, reason || 'Personal Leave', attachmentUrl]
        );
        return insertRes.rows[0];
      });
      res.status(201).json({ success: true, data: result });
    } catch (balErr: any) {
      if (
        balErr?.code === 'COMP_OFF_DISABLED' ||
        balErr?.code === 'DOCUMENT_REQUIRED' ||
        balErr?.code === 'PROBATION_RESTRICTED' ||
        balErr?.code === 'NOTICE_RESTRICTED'
      ) {
        res.status(400).json({
          success: false,
          error: { code: balErr.code, message: balErr.message },
        });
        return;
      }
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

        if (me?.id && String(leave.employee_id) === String(me.id)) {
          throw Object.assign(new Error('You cannot approve your own leave request'), { code: 'FORBIDDEN' });
        }

        if (!isOrgWideRole(req.user?.role)) {
          if (!me?.id) {
            throw Object.assign(new Error('Unable to resolve your employee record'), { code: 'FORBIDDEN' });
          }
          const isDirectReport = await isManagerOf(query, String(me.id), String(leave.employee_id));
          if (!isDirectReport) {
            throw Object.assign(new Error('You can only decide leave for your direct reports'), { code: 'FORBIDDEN' });
          }
        }

        const requested =
          String(status).toLowerCase().trim() === 'approved'
            ? 'approved'
            : String(status).toLowerCase().trim() === 'rejected'
              ? 'rejected'
              : null;
        if (!requested) {
          throw Object.assign(new Error('status must be approved or rejected'), { code: 'FORBIDDEN' });
        }
        const policy = await loadLeavePolicy(query);
        const callerIsManager = me?.id
          ? await isManagerOf(query, String(me.id), String(leave.employee_id))
          : false;
        const decision = nextLeaveDecision({
          workflow: policy.approvalWorkflow,
          callerIsOrgWide: isOrgWideRole(req.user?.role),
          callerIsManager,
          currentStatus: String(leave.status || 'pending'),
          requested,
        });
        if ('error' in decision) {
          throw Object.assign(new Error(decision.error), { code: 'FORBIDDEN' });
        }
        const validStatus = decision.status;

        const nextLeaveType =
          validStatus === 'approved' && forceUnpaid ? 'unpaid' : String(leave.leave_type);

        const prevStatus = String(leave.status);
        const daysCount = Number(leave.days_count) || 1;
        const year = Number(String(leave.start_date).slice(0, 4)) || new Date().getFullYear();

        // Check while the row is still pending, and don't count this request twice
        // (once as a hold, again as the debit). Monthly usage also ignores it until
        // the status actually changes.
        if (validStatus === 'approved' && prevStatus !== 'approved' && isDebitableLeaveType(nextLeaveType)) {
          await assertSufficientBalance(query, leave.employee_id, nextLeaveType, daysCount, year, {
            excludeRequestId: String(leave.id),
          });
        }

        const result = await query(
          `UPDATE leave_requests
           SET status = $1, decision_notes = $2, leave_type = $3, approver_id = $4, updated_at = CURRENT_TIMESTAMP
           WHERE id = $5
           RETURNING *`,
          [validStatus, decisionNotes || null, nextLeaveType, me?.id || null, id]
        );
        const row = result.rows[0];

        if (validStatus === 'approved' && prevStatus !== 'approved' && isDebitableLeaveType(nextLeaveType)) {
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

function calendarDateString(rawDate: unknown): string {
  if (typeof rawDate === 'string') {
    const match = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : rawDate.slice(0, 10);
  }
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`;
  }
  return '';
}

function mapHolidayRow(row: any) {
  const dateStr = calendarDateString(row.holiday_date ?? row.date);

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
        // Full-replace saves must not interleave, or the second insert hits uq_holidays_date
        await query(`LOCK TABLE holidays IN EXCLUSIVE MODE`);
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
          if (me?.id && String(leave.employee_id) === String(me.id)) return null;
          if (!isOrgWideRole(req.user?.role)) {
            if (!me?.id) return null;
            if (!(await isManagerOf(query, String(me.id), String(leave.employee_id)))) return null;
          }

          const policy = await loadLeavePolicy(query);
          const callerIsManager = me?.id
            ? await isManagerOf(query, String(me.id), String(leave.employee_id))
            : false;
          const decision = nextLeaveDecision({
            workflow: policy.approvalWorkflow,
            callerIsOrgWide: isOrgWideRole(req.user?.role),
            callerIsManager,
            currentStatus: String(leave.status || 'pending'),
            requested: mapped,
          });
          if ('error' in decision) return null;
          const validStatus = decision.status;

          const nextLeaveType = validStatus === 'approved' && forceUnpaid ? 'unpaid' : String(leave.leave_type);
          const prevStatus = String(leave.status);
          const daysCount = Number(leave.days_count) || 1;
          const year = Number(String(leave.start_date).slice(0, 4)) || new Date().getFullYear();

          if (validStatus === 'approved' && prevStatus !== 'approved' && isDebitableLeaveType(nextLeaveType)) {
            await assertSufficientBalance(query, leave.employee_id, nextLeaveType, daysCount, year, {
              excludeRequestId: String(leave.id),
            });
          }

          const result = await query(
            `UPDATE leave_requests
             SET status = $1, decision_notes = $2, leave_type = $3, approver_id = $4, updated_at = CURRENT_TIMESTAMP
             WHERE id = $5
             RETURNING *`,
            [validStatus, decisionNotes, nextLeaveType, me?.id || null, id]
          );
          const out = result.rows[0];

          if (validStatus === 'approved' && prevStatus !== 'approved' && isDebitableLeaveType(nextLeaveType)) {
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
      const consumed = await loadConsumedDaysBatch(req.tenantQuery!, [access.target.id], year);
      const [data] = await serializeBalances(req.tenantQuery!, [bal], consumed);
      res.json({ success: true, data });
      return;
    }

    const scope = await getAccessScope(req);
    let sql = `SELECT id FROM employees WHERE COALESCE(account_status, '') <> 'Deactivated'`;
    const params: any[] = [];
    sql = applyEmployeeScopeFilter(scope, sql, params, 'id');
    sql += ` ORDER BY created_at ASC LIMIT 500`;
    const emps = await req.tenantQuery!(sql, params);
    const empIds = emps.rows.map((emp: any) => String(emp.id));
    const balances = await ensureLeaveBalancesBatch(req.tenantQuery!, empIds, year, me?.id);
    const consumed = await loadConsumedDaysBatch(req.tenantQuery!, empIds, year);
    res.json({
      success: true,
      data: await serializeBalances(req.tenantQuery!, balances, consumed),
    });
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

    const consumed = await loadConsumedDaysBatch(req.tenantQuery!, [access.target.id], y);
    const [data] = await serializeBalances(req.tenantQuery!, [bal], consumed);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseTimeToSqlTime(timeStr: string | undefined | null): string | null {
  if (!timeStr) return null;
  const mins = parseTimeToMinutes(String(timeStr));
  if (mins === null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function valueToSqlTime(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:00`;
  }
  const s = String(value).trim();
  const iso = s.match(/T(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}:00`;
  const clock = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (clock && !/am|pm/i.test(s)) {
    return `${String(parseInt(clock[1], 10)).padStart(2, '0')}:${clock[2]}:${clock[3] || '00'}`;
  }
  return parseTimeToSqlTime(s);
}

function clampCoord(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? value : 0;
  return Math.round(Math.max(min, Math.min(max, n)) * 1e6) / 1e6;
}

function combineDateAndTime(dateStr: string, timeStr: string): Date | null {
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (!y || !mo || !d) return null;
  const dt = new Date(y, mo - 1, d, Math.floor(mins / 60), mins % 60, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

function isWfhReasonText(value?: string | null): boolean {
  const text = String(value || '').toLowerCase();
  return text.includes('work from home') || /\bwfh\b/.test(text);
}

/**
 * A WFH approval used to write the shift end (about 18:00) as a checkout.
 * That checkout is still in the future during the workday, so a later punch-in
 * is swallowed and the clock shows a full shift. Drop those rows.
 */
async function clearFutureWfhShiftCheckouts(req: Request): Promise<void> {
  await req.tenantQuery!(
    `DELETE FROM attendance_punches AS p
     WHERE p.punch_type = 'check_out'
       AND p.punch_timestamp > NOW() + INTERVAL '2 minutes'
       AND EXISTS (
         SELECT 1 FROM attendance_regularizations r
         WHERE r.employee_id = p.employee_id
           AND r.date = DATE(p.punch_timestamp)
           AND (
             LOWER(r.reason) LIKE '%work from home%'
             OR LOWER(r.reason) LIKE '%wfh%'
           )
       )`
  );
}

/** Close an open WFH session when the manager rejects. Leaves the check-in in place. */
async function forceClockOutOpenWfhSession(req: Request, employeeId: string, dateStr: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
  const latest = await req.tenantQuery!(
    `SELECT punch_type, office_id, latitude, longitude
     FROM attendance_punches
     WHERE employee_id = $1 AND DATE(punch_timestamp) = $2::date
     ORDER BY punch_timestamp DESC
     LIMIT 1`,
    [employeeId, dateStr]
  );
  const row = latest.rows[0];
  if (!row || String(row.punch_type || '').toLowerCase() !== 'check_in') return;
  const officeId = row.office_id && UUID_RE.test(String(row.office_id)) ? row.office_id : null;
  const lat = clampCoord(Number(row.latitude), -90, 90);
  const lng = clampCoord(Number(row.longitude), -180, 180);
  const ip = clientIp(req) || '127.0.0.1';
  await req.tenantQuery!(
    `INSERT INTO attendance_punches (
      employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
      distance_from_office_meters, is_within_geofence, device_info, ip_address
    ) VALUES (
      $1, $2, 'check_out',
      CASE
        WHEN $3::date = CURRENT_DATE THEN NOW()
        ELSE ($3::date + CURRENT_TIME) AT TIME ZONE current_setting('TIMEZONE')
      END,
      $4, $5, 0, false, $6, $7
    )`,
    [employeeId, officeId, dateStr, lat, lng, 'WFH regularization rejected', ip]
  );
}

async function upsertDayPunches(
  req: Request,
  employeeId: string,
  dateStr: string,
  checkIn?: string | null,
  checkOut?: string | null,
  opts?: { deviceInfo?: string; withinGeofence?: boolean }
): Promise<void> {
  const officeRes = await req.tenantQuery!(`SELECT id, latitude, longitude FROM offices ORDER BY created_at ASC NULLS LAST LIMIT 1`);
  const office = officeRes.rows[0];
  const officeId = office?.id && UUID_RE.test(String(office.id)) ? office.id : null;
  const safeLat = clampCoord(Number(office?.latitude), -90, 90);
  const safeLng = clampCoord(Number(office?.longitude), -180, 180);
  const ip = clientIp(req) || req.ip || '127.0.0.1';
  const deviceInfo = opts?.deviceInfo || 'Manual Edit';
  const withinGeofence = opts?.withinGeofence !== false && !isWfhReasonText(deviceInfo);
  const hasSelfieColumn = await ensurePunchPhotoColumn(req);

  let checkInPhoto: string | null = null;
  let checkOutPhoto: string | null = null;
  if (hasSelfieColumn) {
    const existing = await req.tenantQuery!(
      `SELECT punch_type, selfie_photo
       FROM attendance_punches
       WHERE employee_id = $1 AND DATE(punch_timestamp) = $2::date
       ORDER BY punch_timestamp ASC`,
      [employeeId, dateStr]
    );
    for (const row of existing.rows) {
      const photo = selfieLooksPresent(row.selfie_photo) ? String(row.selfie_photo) : null;
      if (!photo) continue;
      if (row.punch_type === 'check_in' && !checkInPhoto) checkInPhoto = photo;
      if (row.punch_type === 'check_out') checkOutPhoto = photo;
    }
  }

  await req.tenantQuery!(
    `DELETE FROM attendance_punches
     WHERE employee_id = $1 AND DATE(punch_timestamp) = $2::date`,
    [employeeId, dateStr]
  );

  const insertPunch = async (
    punchType: 'check_in' | 'check_out',
    timestamp: Date,
    photo: string | null
  ) => {
    if (hasSelfieColumn) {
      await req.tenantQuery!(
        `INSERT INTO attendance_punches (
          employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
          distance_from_office_meters, is_within_geofence, device_info, ip_address, selfie_photo
         ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10)`,
        [employeeId, officeId, punchType, timestamp.toISOString(), safeLat, safeLng, withinGeofence, deviceInfo, ip, photo]
      );
      return;
    }
    await req.tenantQuery!(
      `INSERT INTO attendance_punches (
        employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
        distance_from_office_meters, is_within_geofence, device_info, ip_address
       ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9)`,
      [employeeId, officeId, punchType, timestamp.toISOString(), safeLat, safeLng, withinGeofence, deviceInfo, ip]
    );
  };

  if (checkIn) {
    const inTs = combineDateAndTime(dateStr, checkIn);
    if (inTs) await insertPunch('check_in', inTs, checkInPhoto);
  }

  if (checkOut) {
    const outTs = combineDateAndTime(dateStr, checkOut);
    if (outTs) await insertPunch('check_out', outTs, checkOutPhoto);
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
      sql += ` AND LOWER(r.status) = $${params.length}`;
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
    const { employeeId, date, requestedCheckIn, requestedCheckOut, reason, remarks, creditCompOff } = req.body;

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
        `SELECT id FROM employees WHERE id::text = $1 OR employee_code = $1 OR LOWER(email) = LOWER($1) LIMIT 1`,
        [employeeId]
      );
      if (empCheck.rows[0]) validEmpId = empCheck.rows[0].id;
      else if (me?.id) validEmpId = me.id;
    }

    const inTime = valueToSqlTime(requestedCheckIn);
    const outTime = valueToSqlTime(requestedCheckOut);
    const reasonText = [reason, remarks].filter(Boolean).join(' — ').slice(0, 1000) || 'Regularization request';
    const dateStr = String(date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_DATE', message: 'A regularization date is required.' },
      });
      return;
    }

    if (creditCompOff === true) {
      const leavePolicy = await loadLeavePolicy(req.tenantQuery!);
      if (!leavePolicy.enableCompOff && isWfhReasonText(reasonText)) {
        res.status(400).json({
          success: false,
          error: { code: 'COMP_OFF_DISABLED', message: 'Comp-off is turned off, so this request cannot be filed.' },
        });
        return;
      }
    }

    const rules = await loadRegularizationRules(req);
    const target = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ageDays = Math.floor((today.getTime() - target.getTime()) / 86400000);
    if (ageDays > rules.windowDays) {
      res.status(400).json({
        success: false,
        error: {
          code: 'OUTSIDE_WINDOW',
          message: `Regularization is only allowed within ${rules.windowDays} days of the missed punch.`,
        },
      });
      return;
    }

    const status = rules.requireManagerApproval ? 'pending' : 'approved';
    const result = await req.tenantQuery!(
      `INSERT INTO attendance_regularizations (
         employee_id, date, requested_check_in, requested_check_out, reason, status
       ) VALUES ($1, $2::date, $3::time, $4::time, $5, $6)
       RETURNING *, date::text AS date`,
      [validEmpId, dateStr, inTime, outTime, reasonText, status]
    );

    if (!rules.requireManagerApproval && !isWfhReasonText(reasonText)) {
      try {
        await upsertDayPunches(req, validEmpId, dateStr, inTime, outTime, {
          deviceInfo: 'Manual Edit',
          withinGeofence: true,
        });
      } catch {
        // The approved row still stands if the punch rewrite fails.
      }
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateRegularizationStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    if (!id || !UUID_RE.test(String(id))) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Regularization not found' },
      });
      return;
    }

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
       WHERE r.id = $1::uuid LIMIT 1`,
      [id]
    );
    if (regRes.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Regularization not found' } });
      return;
    }

    const reg = regRes.rows[0];
    const me = await resolveCallerEmployee(req);
    const ownerId = String(reg.employee_id);

    if (me?.id && ownerId === String(me.id) && !isOrgWideRole(req.user?.role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You cannot approve your own regularization' },
      });
      return;
    }

    if (!isOrgWideRole(req.user?.role)) {
      if (!me?.id) {
        res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Unable to resolve employee' } });
        return;
      }
      const manageable = await getManageableEmployeeIds(req);
      const canManage =
        (await isManagerOf(req.tenantQuery!, String(me.id), ownerId)) ||
        (manageable != null && manageable.has(ownerId) && ownerId !== String(me.id));
      if (!canManage) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only decide regularizations for your team' },
        });
        return;
      }
    }

    const wfh = isWfhReasonText(reg.reason);
    const rawDate = String(reg.date_str || '');
    const dateStr = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
      ? rawDate.slice(0, 10)
      : String(reg.date || '').slice(0, 10);

    const compOffOn = wfh ? (await loadLeavePolicy(req.tenantQuery!)).enableCompOff : false;
    if (
      mapped === 'approved' &&
      wfh &&
      compOffOn &&
      String(reg.status || '').toLowerCase() !== 'approved'
    ) {
      try {
        const year = Number(dateStr.slice(0, 4)) || new Date().getFullYear();
        const schema = String(req.dbSchema || '');
        if (schema) {
          await withTenantTransaction(schema, async (query) => {
            await assertSufficientBalance(query, reg.employee_id, 'wfh', 1, year);
            await adjustLeaveBalance(query, {
              employeeId: reg.employee_id,
              leaveType: 'wfh',
              delta: -1,
              actorId: me?.id || null,
              year,
              notes: 'Debit on WFH regularization approval',
            });
            return null;
          });
        }
      } catch (balanceErr: any) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_WFH_BALANCE',
            message: balanceErr?.message || 'Insufficient WFH balance to approve this request.',
          },
        });
        return;
      }
    }

    const result = await req.tenantQuery!(
      `UPDATE attendance_regularizations
       SET status = $1, approver_id = $2
       WHERE id = $3::uuid
       RETURNING *, date::text AS date`,
      [mapped, me?.id || null, id]
    );

    if (mapped === 'approved' && !wfh) {
      const checkIn = valueToSqlTime(reg.requested_check_in);
      const checkOut = valueToSqlTime(reg.requested_check_out);
      try {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          await upsertDayPunches(req, reg.employee_id, dateStr, checkIn, checkOut, {
            deviceInfo: 'Manual Edit',
            withinGeofence: true,
          });
        }
      } catch {
        // Keep the decision even if rewriting punches fails (coords/schema drift).
      }
    }

    if (mapped === 'rejected' && wfh) {
      try {
        await forceClockOutOpenWfhSession(req, reg.employee_id, dateStr);
      } catch (clockErr) {
        console.warn('WFH rejection clock-out skipped:', clockErr);
      }
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
        // Managers: allow for direct reports and department/team co-lead members
        if (!me?.id || !(await isManagerOf(req.tenantQuery!, String(me.id), String(access.target.id)))) {
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

export async function getAttendanceSession(req: Request, res: Response): Promise<void> {
  try {
    const me = await resolveCallerEmployee(req);
    if (!me?.id) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record.' },
      });
      return;
    }
    try {
      await applyAutoClockOut(req);
    } catch (err) {
      console.warn('Attendance session sweep skipped:', err);
    }
    const data = await readAttendanceSession(req.tenantQuery!, me.id);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function postPresence(req: Request, res: Response): Promise<void> {
  try {
    const me = await resolveCallerEmployee(req);
    if (!me?.id) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record.' },
      });
      return;
    }
    const latitude = Number(req.body?.latitude);
    const longitude = Number(req.body?.longitude);
    const accuracyRaw = req.body?.accuracy;
    const accuracy = accuracyRaw == null || accuracyRaw === '' ? null : Number(accuracyRaw);
    const data = await recordPresencePing(
      req.tenantQuery!,
      me.id,
      latitude,
      longitude,
      accuracy != null && Number.isFinite(accuracy) ? accuracy : null,
      clientIp(req) || '127.0.0.1'
    );
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function postMissedCheckout(req: Request, res: Response): Promise<void> {
  try {
    const me = await resolveCallerEmployee(req);
    if (!me?.id) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Unable to resolve your employee record.' },
      });
      return;
    }
    const result = await submitMissedCheckoutTime(
      req.tenantQuery!,
      me.id,
      String(req.body?.workDate || ''),
      String(req.body?.time || ''),
      clientIp(req) || '127.0.0.1'
    );
    if (!result.ok) {
      res.status(400).json({ success: false, error: { code: 'INVALID_TIME', message: result.message } });
      return;
    }
    res.json({
      success: true,
      data: { workDate: String(req.body.workDate), checkOutLabel: result.checkOutLabel, employeeId: me.id },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

