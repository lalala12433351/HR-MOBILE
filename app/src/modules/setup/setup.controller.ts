import { Request, Response } from 'express';
import {
  provisionEmployeeAuth,
  isPlaceholderCognitoSub,
} from '../identity/provisionEmployeeAuth.js';
import {
  allocateEmployeeCodes,
  allocateOneEmployeeCode,
  repairSetupEmployees,
} from '../identity/employeeProvisionRepair.js';
import { withTenantContext } from '../../db/queryRunner.js';
import { log } from '../../utils/logger.js';
import { authRoleFromJobLevel, inferAuthRoleFromDesignation } from '../../utils/roles.js';
import { syncReportingHierarchy } from '../../utils/reportingHierarchy.js';
import { setDepartmentLeads, setTeamLeads } from '../../utils/orgLeads.js';
import { ensureOwnerOrgDefaults } from '../../utils/orgDefaults.js';
import { ensureDepartmentByName, ensureTeamByName } from '../../utils/orgUpsert.js';
import { LicenseError, assertCanAddEmployees } from '../licenses/license.service.js';

type TenantQuery = NonNullable<Request['tenantQuery']>;

type SetupAssignment = {
  department?: string;
  team?: string;
  managerEmail?: string;
  managerEmails?: string[];
  leadEmail?: string;
  memberEmails?: string[];
};

/**
 * Apply department manager assignments: create/upsert team, promote manager,
 * set team_id + reporting_manager_id on members.
 */
async function applySetupAssignments(query: TenantQuery, assignments: SetupAssignment[]) {
  for (const raw of assignments) {
    const departmentName = String(raw.department || '').trim();
    if (!departmentName) continue;

    const managerEmails = Array.from(
      new Set(
        [...(Array.isArray(raw.managerEmails) ? raw.managerEmails : []), raw.managerEmail, raw.leadEmail]
          .map((e) => String(e || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );
    const memberEmails = Array.from(
      new Set(
        (raw.memberEmails || [])
          .map((e) => String(e || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const departmentId = (await ensureDepartmentByName(query, departmentName))?.id as string | undefined;
    if (!departmentId) continue;

    const managerIds: string[] = [];
    for (const email of managerEmails) {
      const mgrRes = await query(
        `SELECT id FROM employees WHERE LOWER(email) = $1 LIMIT 1`,
        [email]
      );
      if (mgrRes.rows[0]?.id) managerIds.push(String(mgrRes.rows[0].id));
    }
    const managerId = managerIds[0] || null;

    await setDepartmentLeads(query, departmentId, managerIds);

    const teamName = String(raw.team || '').trim() || `${departmentName} Team`;
    const teamId = (await ensureTeamByName(query, departmentId, teamName, managerId))?.id as string | undefined;
    if (!teamId) continue;

    await setTeamLeads(query, teamId, managerIds);
    if (managerIds.length) {
      await query(
        `UPDATE employees
         SET department_id = $2,
             team_id = $3,
             reporting_manager_id = NULL
         WHERE id = ANY($1::uuid[])`,
        [managerIds, departmentId, teamId]
      );
    }

    for (const email of memberEmails) {
      if (managerEmails.includes(email)) continue;
      await query(
        `UPDATE employees
         SET department_id = $2,
             team_id = $3,
             reporting_manager_id = $4
         WHERE LOWER(email) = $1
           AND role IS DISTINCT FROM 'super_admin'`,
        [email, departmentId, teamId, managerId]
      );
    }
  }

  await syncReportingHierarchy(query);
}

const SETTINGS_KEYS = [
  'employment-types',
  'onboarding-fields',
  'general',
  'payroll',
  'attendance',
  'id-card-templates',
] as const;

async function upsertTenantSetting(query: TenantQuery, key: string, value: unknown) {
  const result = await query(
    `INSERT INTO tenant_settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (key) DO UPDATE SET
       value = COALESCE(tenant_settings.value, '{}'::jsonb) || EXCLUDED.value,
       updated_at = CURRENT_TIMESTAMP
     RETURNING key, value`,
    [key, JSON.stringify(value ?? {})]
  );
  return result.rows[0];
}

function settingsHandler(key: (typeof SETTINGS_KEYS)[number]) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const row = await upsertTenantSetting(req.tenantQuery!, key, req.body || {});
      res.status(200).json({ success: true, data: row?.value ?? req.body });
    } catch (err: any) {
      res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
    }
  };
}

export const saveEmploymentTypes = async (req: Request, res: Response): Promise<void> => {
  try {
    const row = await upsertTenantSetting(req.tenantQuery!, 'employment-types', req.body || {});
    const query = req.tenantQuery!;
    const owner = await query(
      `SELECT onboarding_status FROM employees WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1`
    );
    const status = String(owner.rows[0]?.onboarding_status || '').toUpperCase();
    if (status && status !== 'COMPLETED' && status !== 'TEAM_SETUP') {
      await advanceOnboardingStatus(
        'WORK_PATTERNS_SETUP',
        (req as any).user?.sub,
        query,
        (req as any).user?.email
      );
    }
    res.status(200).json({ success: true, data: row?.value ?? req.body });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
};
export const saveOnboardingFields = settingsHandler('onboarding-fields');
export const saveGeneralSettings = settingsHandler('general');
export const savePayrollSettings = settingsHandler('payroll');
export const saveAttendanceSettings = settingsHandler('attendance');

export async function saveIdCardTemplates(req: Request, res: Response): Promise<void> {
  const { templates, defaults } = req.body || {};
  if (!Array.isArray(templates) || (defaults != null && typeof defaults !== 'object')) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Expected { templates: [], defaults: {} }.' },
    });
    return;
  }
  try {
    const row = await upsertTenantSetting(req.tenantQuery!, 'id-card-templates', { templates, defaults: defaults || {} });
    res.status(200).json({ success: true, data: row?.value });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
    await ensureOwnerOrgDefaults(req.tenantQuery!);
    const result = await req.tenantQuery!(
      `SELECT key, value FROM tenant_settings WHERE key = ANY($1::text[])`,
      [SETTINGS_KEYS as unknown as string[]]
    );
    const data: Record<string, unknown> = {};
    for (const row of result.rows) {
      data[row.key] = row.value;
    }
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function advanceOnboardingStatus(
  targetStatus: string,
  userSub: string,
  query: TenantQuery,
  userEmail?: string
) {
  const email = (userEmail || '').trim().toLowerCase();
  await query(
    `UPDATE employees
     SET onboarding_status = $1
     WHERE role = 'super_admin'
       AND (
         (cognito_sub IS NOT NULL AND cognito_sub = $2)
         OR ($3 <> '' AND LOWER(email) = $3)
       )`,
    [targetStatus, userSub || '', email]
  );
}

function authContext(req: Request) {
  return {
    tenantId: req.tenant?.id,
    tenantSlug: req.tenant?.slug,
    schemaName: req.dbSchema || req.tenant?.schema,
  };
}

export async function setupOffice(req: Request, res: Response): Promise<void> {
  try {
    const { name, code, address, latitude, longitude, geofenceRadiusMeters = 100, timezone = 'UTC' } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanAddress = typeof address === 'string' ? address.trim() : '';
    const cleanTimezone = typeof timezone === 'string' ? timezone.trim() : '';
    const latNum = latitude === null || latitude === undefined || latitude === '' ? NaN : Number(latitude);
    const lngNum = longitude === null || longitude === undefined || longitude === '' ? NaN : Number(longitude);
    const radiusNum = Number(geofenceRadiusMeters);
    const validTimezone = (() => {
      try { new Intl.DateTimeFormat('en', { timeZone: cleanTimezone }); return true; }
      catch { return false; }
    })();
    if (cleanName.length < 2 || cleanName.length > 128 || !/\p{L}/u.test(cleanName) || cleanAddress.length < 5 || !Number.isFinite(latNum) ||
        latNum < -90 || latNum > 90 || !Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180 ||
        !Number.isInteger(radiusNum) || radiusNum < 20 || radiusNum > 1000 || !validTimezone) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_WORKPLACE', message: 'Enter a workplace name and address, choose a map location, and select a valid time zone and radius (20–1000 m).' },
      });
      return;
    }
    const cleanCode = (code || cleanName.slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90)).toUpperCase().trim();

    const userSub = (req as any).user?.sub;
    const userEmail = (req as any).user?.email;
    const query = req.tenantQuery!;
    
    // Create Office
    const result = await query(
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
      [cleanName, cleanCode, cleanAddress, latNum, lngNum, radiusNum, cleanTimezone]
    );

    // Advance Status
    await advanceOnboardingStatus('OFFICE_SETUP', userSub, query, userEmail);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function setupWorkplaceMode(req: Request, res: Response): Promise<void> {
  try {
    const mode = req.body?.mode;
    if (!['remote', 'onsite', 'hybrid'].includes(mode)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_WORKPLACE_MODE', message: 'Choose remote, on-site, or hybrid work.' } });
      return;
    }
    const query = req.tenantQuery!;
    if (mode !== 'remote') {
      const offices = await query('SELECT COUNT(*)::int AS count FROM offices WHERE is_active = true');
      if (!Number(offices.rows[0]?.count)) {
        res.status(400).json({ success: false, error: { code: 'WORKPLACE_REQUIRED', message: 'Add a workplace with a selected map location before continuing.' } });
        return;
      }
    }
    await upsertTenantSetting(query, 'general', { workplaceMode: mode });
    await advanceOnboardingStatus('OFFICE_SETUP', (req as any).user?.sub, query, (req as any).user?.email);
    res.json({ success: true, data: { mode } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function setupDepartments(req: Request, res: Response): Promise<void> {
  try {
    const { departments } = req.body || {};
    if (!Array.isArray(departments) || departments.length > 50 ||
        departments.some((item: any) => typeof item?.name !== 'string' || item.name.trim().length < 2 ||
          item.name.trim().length > 80 || !/\p{L}/u.test(item.name))) {
      res.status(400).json({ success: false, error: { code: 'INVALID_DEPARTMENTS', message: 'Enter department names of 2–80 characters. Each name must contain a letter.' } });
      return;
    }
    const userSub = (req as any).user?.sub;
    const userEmail = (req as any).user?.email;
    const query = req.tenantQuery!;
    
    const results = [];
    for (const dept of departments) {
      results.push(await ensureDepartmentByName(query, dept.name, dept.code));
    }

    await advanceOnboardingStatus('DEPARTMENTS_SETUP', userSub, query, userEmail);
    res.status(201).json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function setupRoles(req: Request, res: Response): Promise<void> {
  try {
    const { roles } = req.body || {};
    if (!Array.isArray(roles) || roles.length > 100 ||
        roles.some((item: any) => typeof item?.title !== 'string' || item.title.trim().length < 2 ||
          item.title.trim().length > 80 || !/\p{L}/u.test(item.title))) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ROLES', message: 'Enter job titles of 2–80 characters. Each title must contain a letter.' } });
      return;
    }
    const userSub = (req as any).user?.sub;
    const userEmail = (req as any).user?.email;
    const query = req.tenantQuery!;
    
    const results = [];
    for (const role of roles) {
      const { code, departmentId, level = 'L1' } = role;
      const title = role.title.trim();
      const cleanCode = (code || (title || 'ROLE').slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90)).toUpperCase().trim();

      const result = await query(
        `INSERT INTO job_roles (title, code, department_id, level)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET
           title = EXCLUDED.title,
           department_id = EXCLUDED.department_id,
           level = EXCLUDED.level
         RETURNING *`,
        [title, cleanCode, departmentId || null, level]
      );
      results.push(result.rows[0]);
    }

    await advanceOnboardingStatus('ROLES_SETUP', userSub, query, userEmail);
    res.status(201).json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function setupTeam(req: Request, res: Response): Promise<void> {
  try {
    const { employees, completeOnboarding = false, assignments } = req.body || {};
    if (!Array.isArray(employees) || employees.length > 500 ||
        employees.some((item: any) => typeof item?.firstName !== 'string' || !/\p{L}/u.test(item.firstName) ||
          typeof item?.lastName !== 'string' || !/\p{L}/u.test(item.lastName) ||
          typeof item?.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email))) {
      res.status(400).json({ success: false, error: { code: 'INVALID_TEAM', message: 'Each person needs a first name, last name, and valid email address.' } });
      return;
    }

    const schema = req.dbSchema;
    if (!schema) {
      res.status(400).json({
        success: false,
        error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant schema required' },
      });
      return;
    }

    const userSub = (req as any).user?.sub;
    const userEmail = (req as any).user?.email;
    const actorEmail = (userEmail || '').trim().toLowerCase();
    const ctx = authContext(req);
    const inboundCount = employees.filter((emp: any) => {
      const cleanEmail = (emp.email || '').trim().toLowerCase();
      return !(actorEmail && cleanEmail && cleanEmail === actorEmail);
    }).length;
    if (inboundCount > 0) {
      try {
        await assertCanAddEmployees(ctx.tenantId || req.tenant?.id || req.user?.tenant_id || '', inboundCount);
      } catch (licenseErr: any) {
        if (licenseErr instanceof LicenseError) {
          res.status(licenseErr.httpStatus).json({
            success: false,
            error: { code: licenseErr.code, message: licenseErr.message },
          });
          return;
        }
        throw licenseErr;
      }
    }

    // DB inserts + onboarding advance are atomic. Cognito runs after COMMIT.
    const inserted = await withTenantContext(schema, async (client, query) => {
      await client.query('BEGIN');
      try {
        try {
          await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type VARCHAR(64) DEFAULT 'Full-time'`);
        } catch (_) {}
        const inbound = employees.filter((emp: any) => {
          const cleanEmail = (emp.email || '').trim().toLowerCase();
          return !(actorEmail && cleanEmail && cleanEmail === actorEmail);
        });
        const codes = await allocateEmployeeCodes(query, inbound.length);

        const rows: any[] = [];
        let codeIdx = 0;
        for (const emp of employees) {
          const {
            firstName,
            lastName,
            email,
            phone,
            officeId,
            officeName,
            departmentId,
            department,
            jobRoleId,
            designation,
            dateOfJoining,
            employmentType,
            role: rawRole,
          } = emp;

          const cleanEmail = (email || '').trim().toLowerCase();
          if (actorEmail && cleanEmail && cleanEmail === actorEmail) continue;

          const employeeCode = codes[codeIdx++] || (await allocateOneEmployeeCode(query));
          let resolvedOfficeId = officeId || null;
          let resolvedDepartmentId = departmentId || null;
          let resolvedJobRoleId = jobRoleId || null;

          if (!resolvedOfficeId && officeName) {
            const office = await query('SELECT id FROM offices WHERE name ILIKE $1 LIMIT 1', [officeName]);
            resolvedOfficeId = office.rows[0]?.id || null;
          }
          if (!resolvedDepartmentId && department) {
            const departmentResult = await query('SELECT id FROM departments WHERE name ILIKE $1 LIMIT 1', [department]);
            resolvedDepartmentId = departmentResult.rows[0]?.id || null;
          }
          if (!resolvedJobRoleId && designation) {
            const jobRole = resolvedDepartmentId
              ? await query(
                  `SELECT id, level FROM job_roles
                   WHERE title ILIKE $1 AND department_id = $2
                   LIMIT 1`,
                  [designation, resolvedDepartmentId]
                )
              : await query(
                  `SELECT id, level FROM job_roles
                   WHERE title ILIKE $1
                   ORDER BY CASE WHEN department_id IS NULL THEN 1 ELSE 0 END
                   LIMIT 1`,
                  [designation]
                );
            resolvedJobRoleId = jobRole.rows[0]?.id || null;
          }

          let levelFromJob: string | null = null;
          if (resolvedJobRoleId) {
            const jobLevel = await query('SELECT level FROM job_roles WHERE id = $1 LIMIT 1', [resolvedJobRoleId]);
            levelFromJob = jobLevel.rows[0]?.level || null;
          }
          const resolvedRole =
            authRoleFromJobLevel(levelFromJob) || inferAuthRoleFromDesignation(designation, rawRole);

          if (cleanEmail) {
            const existingAdmin = await query(
              `SELECT id FROM employees
                WHERE role = 'super_admin' AND LOWER(email) = $1
                LIMIT 1`,
              [cleanEmail]
            );
            if (existingAdmin.rows[0]) continue;
          }

          const cleanEmploymentType = String(employmentType || 'Full-time').trim() || 'Full-time';

          const result = await query(
            `INSERT INTO employees (
               employee_code, first_name, last_name, email, phone,
               office_id, department_id, job_role_id, role, employment_status, account_status,
               date_of_joining, has_completed_profile, onboarding_progress, employment_type
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8, $9, 'active', 'Not Activated',
               COALESCE($10::date, CURRENT_DATE), false, 0, $11
             )
             ON CONFLICT (email) DO UPDATE SET
               office_id = EXCLUDED.office_id,
               department_id = EXCLUDED.department_id,
               job_role_id = EXCLUDED.job_role_id,
               employment_type = EXCLUDED.employment_type,
               role = CASE
                 WHEN employees.role = 'super_admin' THEN employees.role
                 ELSE EXCLUDED.role
               END,
               employee_code = CASE
                 WHEN employees.employee_code ILIKE 'SETUP-%' THEN EXCLUDED.employee_code
                 WHEN employees.employee_code IS NULL OR employees.employee_code = '' THEN EXCLUDED.employee_code
                 ELSE employees.employee_code
               END
             WHERE employees.role IS DISTINCT FROM 'super_admin'
             RETURNING *`,
            [
              employeeCode,
              firstName,
              lastName,
              email,
              phone || null,
              resolvedOfficeId,
              resolvedDepartmentId,
              resolvedJobRoleId,
              resolvedRole,
              dateOfJoining || null,
              cleanEmploymentType,
            ]
          );
          if (result.rows[0]) rows.push(result.rows[0]);
        }

        if (Array.isArray(assignments) && assignments.length > 0) {
          await applySetupAssignments(query, assignments as SetupAssignment[]);
        }

        if (completeOnboarding) {
          const email = (userEmail || '').trim().toLowerCase();
          await query(
            `UPDATE employees
             SET onboarding_status = 'COMPLETED', has_completed_profile = true, onboarding_progress = 100
             WHERE role = 'super_admin'
               AND (
                 (cognito_sub IS NOT NULL AND cognito_sub = $1)
                 OR ($2 <> '' AND LOWER(email) = $2)
                 OR employee_code = 'EMP001'
               )`,
            [userSub || '', email]
          );
        } else if (employees.length > 0) {
          await advanceOnboardingStatus('TEAM_SETUP', userSub, query, userEmail);
        }

        await client.query('COMMIT');
        return rows;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    });

    const results: any[] = [];
    for (const created of inserted) {
      if (created?.email) {
        try {
          const needsProvision =
            !created.cognito_sub || isPlaceholderCognitoSub(created.cognito_sub);
          if (needsProvision) {
            const auth = await provisionEmployeeAuth({
              employeeId: created.id,
              email: created.email,
              firstName: created.first_name,
              lastName: created.last_name,
              role: created.role || 'employee',
              tenantId: ctx.tenantId,
              tenantSlug: ctx.tenantSlug,
              schemaName: ctx.schemaName,
              sendInvite: true,
              invitedBy: (req as any).user?.name,
              tenantQuery: req.tenantQuery!,
            });
            created.cognito_sub = auth.cognitoSub;
            created.invite_sent = auth.inviteSent;
            if (auth.inviteSent) created.account_status = 'Invited';
          }
        } catch (authErr: any) {
          log.warn(`Employee ${created.email} saved but Cognito provisioning failed`, authErr);
          created.auth_error = authErr?.message || 'Cognito provisioning failed';
          try {
            await req.tenantQuery!(
              `UPDATE employees SET account_status = 'Auth Error' WHERE id = $1`,
              [created.id]
            );
          } catch (_) {}
        }
      }
      results.push(created);
    }

    try {
      await repairSetupEmployees(req);
    } catch (repairErr: any) {
      log.warn('Post-setup employee repair failed', repairErr);
    }

    const authFailures = results.filter((r) => r.auth_error).length;
    res.status(201).json({
      success: true,
      data: results,
      partial: authFailures > 0,
      message:
        authFailures > 0
          ? `${results.length - authFailures} employees saved; ${authFailures} pending auth provisioning`
          : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
