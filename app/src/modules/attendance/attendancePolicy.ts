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
  } catch {
    return false;
  }
}

export async function applyAutoClockOut(
  req: Request,
  employeeId: string,
  policy: AttendancePolicy
): Promise<void> {
  if (!policy.autoClockOutEnabled) return;
  const hours = policy.autoClockOutHours || 12;

  const open = await req.tenantQuery!(
    `SELECT p.id, p.employee_id, p.office_id, p.punch_timestamp, p.latitude, p.longitude
     FROM attendance_punches p
     WHERE p.employee_id = $1
       AND p.punch_type = 'check_in'
       AND NOT EXISTS (
         SELECT 1 FROM attendance_punches o
         WHERE o.employee_id = p.employee_id
           AND o.punch_type = 'check_out'
           AND o.punch_timestamp > p.punch_timestamp
           AND DATE(o.punch_timestamp) = DATE(p.punch_timestamp)
       )
     ORDER BY p.punch_timestamp DESC
     LIMIT 5`,
    [employeeId]
  );

  for (const row of open.rows) {
    const punched = new Date(row.punch_timestamp);
    if (Number.isNaN(punched.getTime())) continue;
    const ageMs = Date.now() - punched.getTime();
    const crossedMidnight = punched.toISOString().slice(0, 10) !== new Date().toISOString().slice(0, 10);
    const overHours = ageMs >= hours * 60 * 60 * 1000;
    if (!crossedMidnight && !overHours) continue;

    const closeAt = crossedMidnight
      ? new Date(Date.UTC(
          punched.getUTCFullYear(),
          punched.getUTCMonth(),
          punched.getUTCDate(),
          23,
          59,
          0
        ))
      : new Date(punched.getTime() + hours * 60 * 60 * 1000);

    await req.tenantQuery!(
      `INSERT INTO attendance_punches (
         employee_id, office_id, punch_type, punch_timestamp, latitude, longitude,
         distance_from_office_meters, is_within_geofence, device_info, ip_address
       ) VALUES ($1, $2, 'check_out', $3, $4, $5, 0, true, 'Auto Clock-Out', $6)`,
      [
        row.employee_id,
        row.office_id,
        closeAt.toISOString(),
        row.latitude,
        row.longitude,
        clientIp(req) || '127.0.0.1',
      ]
    );
  }
}

export function isRemoteAttendanceDevice(deviceInfo?: string | null): boolean {
  const info = String(deviceInfo || '').toLowerCase();
  return (
    info.includes('wfh') ||
    info.includes('remote') ||
    info.includes('work from home')
  );
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

export function selfieLooksPresent(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v.length > 32 && (v.startsWith('data:image') || v.startsWith('/9j/') || v.startsWith('iVBOR'));
}
