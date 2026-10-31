import { Request } from 'express';
import { signJwt, verifyJwt } from '../../utils/crypto.js';

export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export type OutOfRadiusAction = 'Block' | 'Allow' | 'Warn';

export type AttendancePolicy = {
  requireLocationGPS: boolean;
  geofenceEnabled: boolean;
  geofenceRadiusMeters: number;
  outOfRadiusAction: OutOfRadiusAction;
  requireSelfieCheckIn: boolean;
  requireSelfieCheckOut: boolean;
  allowQrCodeAttendance: boolean;
  qrRefreshIntervalSeconds: number;
  allowedIpAddresses: string;
  autoClockOutEnabled: boolean;
  autoClockOutHours: number;
  officeGeofencePolicies: Array<{
    id?: string;
    name?: string;
    geofencingStatus?: string;
    radiusMeters?: number;
    clockingDevices?: string;
    qrCodeEnabled?: boolean;
  }>;
};

const DEFAULT_POLICY: AttendancePolicy = {
  requireLocationGPS: false,
  geofenceEnabled: false,
  geofenceRadiusMeters: 150,
  outOfRadiusAction: 'Allow',
  requireSelfieCheckIn: false,
  requireSelfieCheckOut: false,
  allowQrCodeAttendance: false,
  qrRefreshIntervalSeconds: 30,
  allowedIpAddresses: '',
  autoClockOutEnabled: false,
  autoClockOutHours: 12,
  officeGeofencePolicies: [],
};

export async function loadRegularizationRules(
  req: Request
): Promise<{ windowDays: number; requireManagerApproval: boolean }> {
  try {
    const res = await req.tenantQuery!(
      `SELECT value FROM tenant_settings WHERE key = 'attendance' LIMIT 1`
    );
    const blob = res.rows[0]?.value || {};
    const settings = blob.attendanceSettings || blob.attendance_settings || {};
    const windowDays = Math.min(
      90,
      Math.max(1, Number(settings.regularizationWindowDays || settings.regularizationDaysWindow) || 11)
    );
    return {
      windowDays,
      requireManagerApproval: settings.requireManagerRegularizationApproval !== false,
    };
  } catch {
    return { windowDays: 11, requireManagerApproval: true };
  }
}

export async function loadAttendancePolicy(req: Request): Promise<AttendancePolicy> {
  try {
    const res = await req.tenantQuery!(
      `SELECT value FROM tenant_settings WHERE key = 'attendance' LIMIT 1`
    );
    const blob = res.rows[0]?.value || {};
    const settings = blob.attendanceSettings || blob.attendance_settings || {};
    const policies = blob.attendancePolicies || blob.attendance_policies || {};
    const actionRaw = String(settings.outOfRadiusAction || policies.outOfRadiusAction || '');
    const outOfRadiusAction: OutOfRadiusAction =
      actionRaw === 'Block' || actionRaw === 'Warn' ? actionRaw : 'Allow';
    const gpsOn = settings.requireLocationGPS === true || settings.requireGPS === true;
    const geofenceOn =
      settings.geofenceEnabled === true ||
      (gpsOn && settings.geofenceEnabled !== false);

    return {
      requireLocationGPS: gpsOn,
      geofenceEnabled:
        geofenceOn &&
        String(settings.geofencePolicy || '') !== 'Disabled' &&
        String(settings.geofencePolicy || '') !== 'Optional',
      geofenceRadiusMeters: Number(settings.geofenceRadiusMeters || policies.geofenceRadiusMeters || 150) || 150,
      outOfRadiusAction,
      requireSelfieCheckIn: settings.requireSelfieCheckIn === true,
      requireSelfieCheckOut: settings.requireSelfieCheckOut === true,
      allowQrCodeAttendance: settings.allowQrCodeAttendance === true,
      qrRefreshIntervalSeconds: Math.min(
        300,
        Math.max(15, Number(settings.qrRefreshIntervalSeconds) || 30)
      ),
      allowedIpAddresses: String(settings.allowedIpAddresses || '').trim(),
      autoClockOutEnabled: settings.autoClockOutEnabled === true,
      autoClockOutHours: Math.min(24, Math.max(1, Number(settings.autoClockOutHours) || 12)),
      officeGeofencePolicies: Array.isArray(settings.officeGeofencePolicies)
        ? settings.officeGeofencePolicies
        : [],
    };
  } catch {
    return { ...DEFAULT_POLICY };
  }
}

export function officePolicyFor(
  policy: AttendancePolicy,
  office: { id?: string; name?: string; geofence_radius_meters?: number } | null
) {
  if (!office) return null;
  const match = policy.officeGeofencePolicies.find(
    (p) =>
      (p.id && office.id && String(p.id) === String(office.id)) ||
      (p.name && office.name && String(p.name).trim().toLowerCase() === String(office.name).trim().toLowerCase())
  );
  return match || null;
}

export function isGeofenceRequired(
  policy: AttendancePolicy,
  office: { id?: string; name?: string } | null,
  isRemote: boolean
): boolean {
  if (isRemote) return false;
  if (!policy.geofenceEnabled || !policy.requireLocationGPS) return false;
  const match = officePolicyFor(policy, office);
  const status = String(match?.geofencingStatus || 'Active');
  return status !== 'Inactive' && status !== 'Optional';
}

export function officeAllowsQr(
  policy: AttendancePolicy,
  office: { id?: string; name?: string } | null
): boolean {
  if (!policy.allowQrCodeAttendance) return false;
  const match = officePolicyFor(policy, office);
  if (!match) return true;
  return match.qrCodeEnabled !== false;
}

export function officeClockingDevices(
  policy: AttendancePolicy,
  office: { id?: string; name?: string } | null
): string {
  const match = officePolicyFor(policy, office);
  return String(match?.clockingDevices || 'Desktop, Mobile');
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function ipMatchesCidr(ip: string, rule: string): boolean {
  const cleanedIp = ip.replace(/^::ffff:/, '').trim();
  const cleanedRule = rule.trim();
  if (!cleanedRule) return false;
  if (cleanedIp === cleanedRule) return true;
  const cidr = cleanedRule.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!cidr) return false;
  const base = ipv4ToInt(cidr[1]);
  const addr = ipv4ToInt(cleanedIp);
  const bits = Number(cidr[2]);
  if (base == null || addr == null || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (base & mask) === (addr & mask);
}

export function clientIp(req: Request): string {
  const forwarded = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();
  return forwarded || req.ip || req.socket?.remoteAddress || '';
}

const DEMO_IP_ALLOWLIST = '192.168.1.0/24, 106.51.72.18';

export function isIpAllowed(policy: AttendancePolicy, ip: string): boolean {
  const raw = policy.allowedIpAddresses.trim();
  if (!raw || raw === DEMO_IP_ALLOWLIST) return true;
  const list = raw
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) return true;
  const candidate = ip.replace(/^::ffff:/, '');
  if (!candidate || candidate === '::1' || candidate === '127.0.0.1') {
    // Local/dev punches are allowed unless the allowlist explicitly forbids loopback
    if (list.some((r) => r === '127.0.0.1' || r === '::1' || r.startsWith('127.'))) {
      return list.some((r) => ipMatchesCidr(candidate, r) || r === candidate);
    }
    return true;
  }
  return list.some((r) => ipMatchesCidr(candidate, r));
}

export function isMobileUserAgent(ua: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile/i.test(ua || '');
}

export function assertClockingDeviceAllowed(
  policy: AttendancePolicy,
  office: { id?: string; name?: string } | null,
  req: Request,
  usedQr: boolean
): { ok: true } | { ok: false; message: string } {
  const devices = officeClockingDevices(policy, office).toLowerCase();
  const ua = String(req.headers['user-agent'] || '');
  if (devices.includes('biometric') && !usedQr) {
    return {
      ok: false,
      message: 'This office only accepts kiosk / QR punches. Scan the office QR code to clock in.',
    };
  }
  if (devices.includes('mobile only') && !isMobileUserAgent(ua) && !usedQr) {
    return {
      ok: false,
      message: 'This office only allows punches from a mobile device.',
    };
  }
  return { ok: true };
}

export function createOfficeQrToken(
  tenantId: string,
  officeId: string,
  ttlSeconds: number
): { token: string; expiresAt: string } {
  const token = signJwt(
    { typ: 'attendance_qr', tenantId, officeId },
    Math.max(15, ttlSeconds)
  );
  return {
    token,
    expiresAt: new Date(Date.now() + Math.max(15, ttlSeconds) * 1000).toISOString(),
  };
}

export function verifyOfficeQrToken(
  token: string,
  tenantId: string,
  officeId?: string | null
): { ok: true; officeId: string } | { ok: false; message: string } {
  const payload = verifyJwt<{ typ?: string; tenantId?: string; officeId?: string }>(token);
  if (!payload || payload.typ !== 'attendance_qr') {
    return { ok: false, message: 'Invalid or expired office QR code.' };
  }
  if (payload.tenantId && payload.tenantId !== tenantId) {
    return { ok: false, message: 'This QR code belongs to another workspace.' };
  }
  if (officeId && payload.officeId && String(payload.officeId) !== String(officeId)) {
    return { ok: false, message: 'This QR code is for a different office.' };
  }
  return { ok: true, officeId: String(payload.officeId || officeId || '') };
}

export async function ensurePunchPhotoColumn(req: Request): Promise<boolean> {
  try {
    await req.tenantQuery!(`ALTER TABLE attendance_punches ADD COLUMN IF NOT EXISTS selfie_photo TEXT`);
    return true;
  } catch (err) {
    console.error('Could not add attendance_punches.selfie_photo:', err);
    return false;
  }
}

type TenantSql = (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export const OUTSIDE_DWELL_MS = 15 * 60 * 1000;
const GEOFENCE_DEVICE = 'Left office geofence';
const MISSED_TIME_DEVICE = 'Missed punch-out time';

/** Office rows default to UTC when nobody set a zone. This product’s workday is India. */
const ZONE_SQL = `CASE
  WHEN o.timezone IS NULL OR BTRIM(o.timezone) = '' OR UPPER(BTRIM(o.timezone)) = 'UTC'
  THEN 'Asia/Kolkata'
  ELSE BTRIM(o.timezone)
END`;

export function isWfhDeviceInfo(device?: string | null): boolean {
  const text = String(device || '').toLowerCase();
  return text.includes('work from home') || text.includes('remote') || /\bwfh\b/.test(text);
}

export function safeTimeZone(value?: string | null): string {
  const zone = String(value || '').trim();
  const chosen = !zone || zone.toUpperCase() === 'UTC' ? 'Asia/Kolkata' : zone;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: chosen });
    return chosen;
  } catch {
    return 'Asia/Kolkata';
  }
}

export function dateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function clockLabelInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimeZone(timeZone),
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

/** UTC instant for a clock time on a calendar date in an IANA zone. */
export function zonedLocalToUtc(workDate: string, hours: number, minutes: number, timeZone: string): Date {
  const zone = safeTimeZone(timeZone);
  const [year, month, day] = workDate.split('-').map(Number);
  const desired = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let guess = desired;
  for (let i = 0; i < 3; i += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
    let hour = pick('hour');
    if (hour === 24) hour = 0;
    const actual = Date.UTC(pick('year'), pick('month') - 1, pick('day'), hour, pick('minute'), pick('second'));
    guess += desired - actual;
  }
  return new Date(guess);
}

function clampCoord(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? value : 0;
  return Math.round(Math.max(min, Math.min(max, n)) * 1e6) / 1e6;
}

function readingUsable(
  accuracy: number | null,
  radius: number,
  lastLat: number | null,
  lastLng: number | null,
  lat: number,
  lng: number
): boolean {
  if (accuracy == null || !Number.isFinite(accuracy) || accuracy <= 0) return false;
  if (accuracy > radius) return false;
  if (lastLat != null && lastLng != null) {
    const jump = calculateDistanceMeters(lastLat, lastLng, lat, lng);
    if (jump > 1500 && accuracy > 40) return false;
  }
  return true;
}

async function runWithZone(query: TenantSql, build: (zoneSql: string) => Promise<void>): Promise<void> {
  try {
    await build(ZONE_SQL);
  } catch (err) {
    const message = String((err as { message?: string })?.message || err).toLowerCase();
    if (!message.includes('time zone')) throw err;
    await build(`'Asia/Kolkata'`);
  }
}

export async function ensureAttendanceWatchTables(query: TenantSql): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS attendance_missed_checkouts (
       employee_id UUID NOT NULL,
       work_date DATE NOT NULL,
       check_in_punch_id UUID,
       last_seen_at TIMESTAMPTZ,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (employee_id, work_date)
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS attendance_presence (
       employee_id UUID PRIMARY KEY,
       office_id UUID,
       latitude DOUBLE PRECISION,
       longitude DOUBLE PRECISION,
       accuracy_meters DOUBLE PRECISION,
       outside_since TIMESTAMPTZ,
       last_inside_at TIMESTAMPTZ,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
}

/**
 * After the office-local day ends, remember that the punch-out is missing.
 * No checkout time is written. The person fills that in the next time they open the site.
 */
export async function markMissedCheckouts(query: TenantSql): Promise<void> {
  await ensureAttendanceWatchTables(query);
  await runWithZone(query, async (zone) => {
    await query(
      `DELETE FROM attendance_punches AS c
       WHERE LOWER(c.punch_type) = 'check_out'
         AND c.device_info = 'Auto Clock-Out'
         AND EXISTS (
           SELECT 1
           FROM attendance_punches cin
           LEFT JOIN offices o ON o.id = COALESCE(cin.office_id, c.office_id)
           WHERE cin.employee_id = c.employee_id
             AND LOWER(cin.punch_type) = 'check_in'
             AND cin.punch_timestamp < c.punch_timestamp
             AND NOT EXISTS (
               SELECT 1 FROM attendance_punches mid
               WHERE mid.employee_id = c.employee_id
                 AND mid.punch_timestamp > cin.punch_timestamp
                 AND mid.punch_timestamp < c.punch_timestamp
             )
             AND (cin.punch_timestamp AT TIME ZONE ${zone})::date
                 IS DISTINCT FROM (c.punch_timestamp AT TIME ZONE ${zone})::date
         )`
    );
    await query(
      `INSERT INTO attendance_missed_checkouts (employee_id, work_date, check_in_punch_id, last_seen_at)
       SELECT DISTINCT ON (p.employee_id, (p.punch_timestamp AT TIME ZONE ${zone})::date)
         p.employee_id,
         (p.punch_timestamp AT TIME ZONE ${zone})::date,
         p.id,
         CASE
           WHEN pres.last_inside_at IS NOT NULL
            AND pres.last_inside_at >= p.punch_timestamp
            AND (pres.last_inside_at AT TIME ZONE ${zone})::date = (p.punch_timestamp AT TIME ZONE ${zone})::date
           THEN pres.last_inside_at
           ELSE NULL
         END
       FROM attendance_punches p
       LEFT JOIN offices o ON o.id = p.office_id
       LEFT JOIN attendance_presence pres ON pres.employee_id = p.employee_id
       WHERE LOWER(p.punch_type) = 'check_in'
         AND (p.punch_timestamp AT TIME ZONE ${zone})::date < (NOW() AT TIME ZONE ${zone})::date
         AND NOT EXISTS (
           SELECT 1 FROM attendance_punches c
           WHERE c.employee_id = p.employee_id
             AND LOWER(c.punch_type) = 'check_out'
             AND c.punch_timestamp > p.punch_timestamp
         )
       ORDER BY p.employee_id, (p.punch_timestamp AT TIME ZONE ${zone})::date, p.punch_timestamp DESC
       ON CONFLICT (employee_id, work_date) DO UPDATE
       SET check_in_punch_id = EXCLUDED.check_in_punch_id,
           last_seen_at = COALESCE(EXCLUDED.last_seen_at, attendance_missed_checkouts.last_seen_at)`
    );
  });
  await query(
    `DELETE FROM attendance_missed_checkouts m
     USING attendance_punches p
     WHERE p.id = m.check_in_punch_id
       AND EXISTS (
         SELECT 1 FROM attendance_punches c
         WHERE c.employee_id = m.employee_id
           AND LOWER(c.punch_type) = 'check_out'
           AND c.punch_timestamp > p.punch_timestamp
       )`
  );
}

export type MissedCheckoutRow = {
  workDate: string;
  checkInLabel: string;
  lastSeenLabel: string | null;
};

export async function listMissedCheckouts(query: TenantSql, employeeId: string): Promise<MissedCheckoutRow[]> {
  await ensureAttendanceWatchTables(query);
  const result = await query(
    `SELECT m.work_date::text AS work_date, m.last_seen_at, p.punch_timestamp,
            ${ZONE_SQL} AS timezone
     FROM attendance_missed_checkouts m
     JOIN attendance_punches p ON p.id = m.check_in_punch_id
     LEFT JOIN offices o ON o.id = p.office_id
     WHERE m.employee_id = $1
     ORDER BY m.work_date DESC
     LIMIT 14`,
    [employeeId]
  );
  return result.rows.map((row) => {
    const zone = safeTimeZone(row.timezone);
    const checkIn = new Date(row.punch_timestamp);
    const seen = row.last_seen_at ? new Date(row.last_seen_at) : null;
    const seenOk = seen && !Number.isNaN(seen.getTime()) && dateKeyInZone(seen, zone) === String(row.work_date).slice(0, 10);
    return {
      workDate: String(row.work_date).slice(0, 10),
      checkInLabel: clockLabelInZone(checkIn, zone),
      lastSeenLabel: seenOk ? clockLabelInZone(seen as Date, zone) : null,
    };
  });
}

export async function submitMissedCheckoutTime(
  query: TenantSql,
  employeeId: string,
  workDate: string,
  time: string,
  ipAddress: string
): Promise<{ ok: true; checkOutLabel: string } | { ok: false; message: string }> {
  await ensureAttendanceWatchTables(query);
  const match = String(time || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return { ok: false, message: 'Enter the time you left as HH:MM.' };
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return { ok: false, message: 'That time is not valid.' };

  const found = await query(
    `SELECT m.work_date::text AS work_date, p.punch_timestamp, p.office_id, p.latitude, p.longitude, p.is_within_geofence,
            ${ZONE_SQL} AS timezone
     FROM attendance_missed_checkouts m
     JOIN attendance_punches p ON p.id = m.check_in_punch_id
     LEFT JOIN offices o ON o.id = p.office_id
     WHERE m.employee_id = $1 AND m.work_date = $2::date
     LIMIT 1`,
    [employeeId, workDate]
  );
  const row = found.rows[0];
  if (!row) return { ok: false, message: 'That day does not need a punch-out time.' };

  const zone = safeTimeZone(row.timezone);
  if (workDate >= dateKeyInZone(new Date(), zone)) {
    return { ok: false, message: 'Today’s shift is still open. Punch out from the clock when you leave.' };
  }
  const checkIn = new Date(row.punch_timestamp);
  const checkoutAt = zonedLocalToUtc(workDate, hours, minutes, zone);
  if (Number.isNaN(checkoutAt.getTime()) || dateKeyInZone(checkoutAt, zone) !== workDate) {
    return { ok: false, message: 'That time has to be on the day you punched in.' };
  }
  if (checkoutAt.getTime() <= checkIn.getTime()) {
    return { ok: false, message: 'The punch-out has to be after the punch-in.' };
  }

  const lat = clampCoord(Number(row.latitude), -90, 90);
  const lng = clampCoord(Number(row.longitude), -180, 180);
  await query(
    `INSERT INTO attendance_punches (
       employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
       distance_from_office_meters, is_within_geofence, device_info, ip_address
     ) VALUES ($1, $2, 'check_out', $3, $4, $5, 0, $6, $7, $8)`,
    [
      employeeId,
      row.office_id,
      checkoutAt.toISOString(),
      lat,
      lng,
      row.is_within_geofence !== false,
      MISSED_TIME_DEVICE,
      String(ipAddress || '127.0.0.1').slice(0, 64),
    ]
  );
  await query(`DELETE FROM attendance_missed_checkouts WHERE employee_id = $1 AND work_date = $2::date`, [
    employeeId,
    workDate,
  ]);
  return { ok: true, checkOutLabel: clockLabelInZone(checkoutAt, zone) };
}

type OpenPunch = {
  id: string;
  punch_type: string;
  punch_timestamp: string;
  device_info?: string | null;
  is_within_geofence?: boolean | null;
  office_id?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  office_lat?: number | string | null;
  office_lng?: number | string | null;
  geofence_radius_meters?: number | string | null;
  timezone?: string | null;
};

async function latestPunch(query: TenantSql, employeeId: string): Promise<OpenPunch | null> {
  const result = await query(
    `SELECT p.id, p.punch_type, p.punch_timestamp, p.device_info, p.is_within_geofence, p.office_id,
            p.latitude, p.longitude,
            o.latitude AS office_lat, o.longitude AS office_lng, o.geofence_radius_meters, o.timezone
     FROM attendance_punches p
     LEFT JOIN offices o ON o.id = p.office_id
     WHERE p.employee_id = $1
     ORDER BY p.punch_timestamp DESC
     LIMIT 1`,
    [employeeId]
  );
  return result.rows[0] || null;
}

function punchIsOpenOfficeToday(punch: OpenPunch | null): punch is OpenPunch {
  if (!punch || String(punch.punch_type || '').toLowerCase() !== 'check_in') return false;
  if (isWfhDeviceInfo(punch.device_info)) return false;
  const zone = safeTimeZone(punch.timezone);
  const punched = new Date(punch.punch_timestamp);
  if (Number.isNaN(punched.getTime())) return false;
  return dateKeyInZone(punched, zone) === dateKeyInZone(new Date(), zone);
}

function startedInsideOffice(punch: OpenPunch, lastInsideAt: Date | null): boolean {
  if (punch.is_within_geofence !== false) return true;
  const punched = new Date(punch.punch_timestamp).getTime();
  return Boolean(lastInsideAt && lastInsideAt.getTime() >= punched);
}

async function insertGeofenceCheckout(
  query: TenantSql,
  employeeId: string,
  punch: OpenPunch,
  at: Date,
  lat: number,
  lng: number,
  ipAddress: string
): Promise<void> {
  const officeLat = Number(punch.office_lat);
  const officeLng = Number(punch.office_lng);
  const distance =
    Number.isFinite(officeLat) && Number.isFinite(officeLng)
      ? Math.min(999999.99, calculateDistanceMeters(lat, lng, officeLat, officeLng))
      : 0;
  await query(
    `INSERT INTO attendance_punches (
       employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
       distance_from_office_meters, is_within_geofence, device_info, ip_address
     ) VALUES ($1, $2, 'check_out', $3, $4, $5, $6, false, $7, $8)`,
    [
      employeeId,
      punch.office_id || null,
      at.toISOString(),
      clampCoord(lat, -90, 90),
      clampCoord(lng, -180, 180),
      distance,
      GEOFENCE_DEVICE,
      String(ipAddress || '127.0.0.1').slice(0, 64),
    ]
  );
  await query(
    `UPDATE attendance_presence
     SET outside_since = NULL, updated_at = NOW()
     WHERE employee_id = $1`,
    [employeeId]
  );
}

export async function completeDueGeofenceSignOuts(
  query: TenantSql,
  dwellMs: number = OUTSIDE_DWELL_MS
): Promise<void> {
  await ensureAttendanceWatchTables(query);
  const due = await query(
    `SELECT pres.employee_id, pres.latitude, pres.longitude, pres.outside_since, pres.last_inside_at,
            p.punch_type, p.punch_timestamp, p.device_info, p.is_within_geofence, p.office_id,
            o.latitude AS office_lat, o.longitude AS office_lng, o.geofence_radius_meters, o.timezone
     FROM attendance_presence pres
     JOIN LATERAL (
       SELECT * FROM attendance_punches lp
       WHERE lp.employee_id = pres.employee_id
       ORDER BY lp.punch_timestamp DESC
       LIMIT 1
     ) p ON TRUE
     LEFT JOIN offices o ON o.id = p.office_id
     WHERE pres.outside_since IS NOT NULL
       AND pres.outside_since <= NOW() - ($1::double precision * INTERVAL '1 millisecond')
       AND LOWER(p.punch_type) = 'check_in'`,
    [dwellMs]
  );
  for (const row of due.rows) {
    const punch = row as OpenPunch;
    if (!punchIsOpenOfficeToday(punch)) {
      await query(`UPDATE attendance_presence SET outside_since = NULL, updated_at = NOW() WHERE employee_id = $1`, [
        row.employee_id,
      ]);
      continue;
    }
    const lastInside = row.last_inside_at ? new Date(row.last_inside_at) : null;
    if (!startedInsideOffice(punch, lastInside)) continue;
    const leftAt = new Date(row.outside_since);
    const punchedAt = new Date(punch.punch_timestamp);
    if (Number.isNaN(leftAt.getTime()) || leftAt.getTime() <= punchedAt.getTime()) continue;
    await insertGeofenceCheckout(
      query,
      String(row.employee_id),
      punch,
      leftAt,
      Number(row.latitude),
      Number(row.longitude),
      '127.0.0.1'
    );
  }
}

export type PresencePingResult = {
  status: 'inside' | 'outside' | 'signed_out' | 'ignored';
  reason?: string;
  outsideSince?: string | null;
  signsOutAt?: string | null;
  workDate?: string;
  checkOutLabel?: string;
  /** True when this ping first marked the employee outside after being inside. */
  firstOutside?: boolean;
};

export async function recordPresencePing(
  query: TenantSql,
  employeeId: string,
  latitude: number,
  longitude: number,
  accuracy: number | null,
  ipAddress: string
): Promise<PresencePingResult> {
  await ensureAttendanceWatchTables(query);
  const punch = await latestPunch(query, employeeId);
  if (!punchIsOpenOfficeToday(punch)) return { status: 'ignored', reason: 'not_in_office' };

  const officeLat = Number(punch.office_lat);
  const officeLng = Number(punch.office_lng);
  if (!Number.isFinite(officeLat) || !Number.isFinite(officeLng)) {
    return { status: 'ignored', reason: 'office_unmapped' };
  }
  const radius = Number(punch.geofence_radius_meters) || 150;
  const existing = await query(
    `SELECT latitude, longitude, outside_since, last_inside_at FROM attendance_presence WHERE employee_id = $1`,
    [employeeId]
  );
  const prior = existing.rows[0];
  const lastLat = prior ? Number(prior.latitude) : null;
  const lastLng = prior ? Number(prior.longitude) : null;
  if (!readingUsable(accuracy, radius, Number.isFinite(lastLat) ? lastLat : null, Number.isFinite(lastLng) ? lastLng : null, latitude, longitude)) {
    return { status: 'ignored', reason: 'weak_gps' };
  }

  const distance = calculateDistanceMeters(latitude, longitude, officeLat, officeLng);
  const inside = distance <= radius;
  const lastInside = prior?.last_inside_at ? new Date(prior.last_inside_at) : null;
  const punchedAt = new Date(punch.punch_timestamp);

  if (inside) {
    await query(
      `INSERT INTO attendance_presence (
         employee_id, office_id, latitude, longitude, accuracy_meters, outside_since, last_inside_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, NULL, NOW(), NOW())
       ON CONFLICT (employee_id) DO UPDATE
       SET office_id = EXCLUDED.office_id,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           accuracy_meters = EXCLUDED.accuracy_meters,
           outside_since = NULL,
           last_inside_at = NOW(),
           updated_at = NOW()`,
      [employeeId, punch.office_id || null, latitude, longitude, accuracy]
    );
    return { status: 'inside' };
  }

  if (!startedInsideOffice(punch, lastInside)) {
    return { status: 'ignored', reason: 'never_inside' };
  }

  const priorOutside = prior?.outside_since ? new Date(prior.outside_since) : null;
  const firstOutside = !priorOutside || priorOutside.getTime() <= punchedAt.getTime();
  let outsideSince = priorOutside;
  if (!outsideSince || outsideSince.getTime() <= punchedAt.getTime()) outsideSince = new Date();
  await query(
    `INSERT INTO attendance_presence (
       employee_id, office_id, latitude, longitude, accuracy_meters, outside_since, last_inside_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (employee_id) DO UPDATE
     SET office_id = EXCLUDED.office_id,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         accuracy_meters = EXCLUDED.accuracy_meters,
         outside_since = CASE
           WHEN attendance_presence.outside_since IS NULL OR attendance_presence.outside_since <= $8::timestamptz
           THEN EXCLUDED.outside_since
           ELSE attendance_presence.outside_since
         END,
         updated_at = NOW()`,
    [
      employeeId,
      punch.office_id || null,
      latitude,
      longitude,
      accuracy,
      outsideSince.toISOString(),
      lastInside ? lastInside.toISOString() : null,
      punchedAt.toISOString(),
    ]
  );
  const stored = await query(`SELECT outside_since, latitude, longitude FROM attendance_presence WHERE employee_id = $1`, [
    employeeId,
  ]);
  const since = new Date(stored.rows[0]?.outside_since || outsideSince);
  if (Date.now() - since.getTime() >= OUTSIDE_DWELL_MS && since.getTime() > punchedAt.getTime()) {
    const zone = safeTimeZone(punch.timezone);
    await insertGeofenceCheckout(
      query,
      employeeId,
      punch,
      since,
      Number(stored.rows[0]?.latitude ?? latitude),
      Number(stored.rows[0]?.longitude ?? longitude),
      ipAddress
    );
    return {
      status: 'signed_out',
      outsideSince: since.toISOString(),
      workDate: dateKeyInZone(punchedAt, zone),
      checkOutLabel: clockLabelInZone(since, zone),
      firstOutside,
    };
  }
  return {
    status: 'outside',
    outsideSince: since.toISOString(),
    signsOutAt: new Date(since.getTime() + OUTSIDE_DWELL_MS).toISOString(),
    firstOutside,
  };
}

export type AttendanceSessionSnapshot = {
  openOfficePunch: boolean;
  missedCheckouts: MissedCheckoutRow[];
  recentGeofenceSignOut: { workDate: string; checkOutLabel: string; at: string } | null;
};

export async function readAttendanceSession(query: TenantSql, employeeId: string): Promise<AttendanceSessionSnapshot> {
  await ensureAttendanceWatchTables(query);
  const punch = await latestPunch(query, employeeId);
  const missedCheckouts = await listMissedCheckouts(query, employeeId);
  let recentGeofenceSignOut: AttendanceSessionSnapshot['recentGeofenceSignOut'] = null;
  if (punch && String(punch.punch_type || '').toLowerCase() === 'check_out' && punch.device_info === GEOFENCE_DEVICE) {
    const at = new Date(punch.punch_timestamp);
    if (!Number.isNaN(at.getTime()) && Date.now() - at.getTime() < 15 * 60 * 1000) {
      const zone = safeTimeZone(punch.timezone);
      recentGeofenceSignOut = {
        at: at.toISOString(),
        workDate: dateKeyInZone(at, zone),
        checkOutLabel: clockLabelInZone(at, zone),
      };
    }
  }
  return {
    openOfficePunch: punchIsOpenOfficeToday(punch),
    missedCheckouts,
    recentGeofenceSignOut,
  };
}

export function isRemoteAttendanceDevice(deviceInfo?: string | null): boolean {
  const info = String(deviceInfo || '').toLowerCase();
  return info.includes('wfh') || info.includes('remote') || info.includes('work from home');
}

export async function findOpenCheckIn(
  req: Request,
  employeeId: string
): Promise<{
  id: string;
  employee_id: string;
  office_id: string | null;
  punch_timestamp: string | Date;
  latitude: number | null;
  longitude: number | null;
  device_info: string | null;
} | null> {
  const open = await req.tenantQuery!(
    `SELECT p.id, p.employee_id, p.office_id, p.punch_timestamp, p.latitude, p.longitude, p.device_info
     FROM attendance_punches p
     WHERE p.employee_id = $1
       AND p.punch_type = 'check_in'
       AND NOT EXISTS (
         SELECT 1 FROM attendance_punches o
         WHERE o.employee_id = p.employee_id
           AND o.punch_type = 'check_out'
           AND o.punch_timestamp > p.punch_timestamp
       )
     ORDER BY p.punch_timestamp DESC
     LIMIT 1`,
    [employeeId]
  );
  return open.rows[0] || null;
}

export async function applyAutoClockOut(req: Request, _employeeId?: string, _policy?: AttendancePolicy): Promise<void> {
  if (!req.tenantQuery) return;
  await markMissedCheckouts(req.tenantQuery);
  await completeDueGeofenceSignOuts(req.tenantQuery, OUTSIDE_DWELL_MS);
}

export function selfieLooksPresent(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v.length > 32 && (v.startsWith('data:image') || v.startsWith('/9j/') || v.startsWith('iVBOR'));
}
