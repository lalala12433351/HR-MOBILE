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
import { inferAuthRoleFromDesignation, promoteEmployeeToManager } from '../../utils/roles.js';

type TenantQuery = NonNullable<Request['tenantQuery']>;

type SetupAssignment = {
  department?: string;
  managerEmail?: string;
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

    const managerEmail = String(raw.managerEmail || raw.leadEmail || '')
      .trim()
      .toLowerCase();
    const memberEmails = Array.from(
      new Set(
        (raw.memberEmails || [])
          .map((e) => String(e || '').trim().toLowerCase())
          .filter(Boolean)
      )
    );

    const deptRes = await query(
      `SELECT id FROM departments WHERE name ILIKE $1 LIMIT 1`,
      [departmentName]
    );
    let departmentId = deptRes.rows[0]?.id as string | undefined;
    if (!departmentId) {
      const code =
        departmentName.slice(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '') +
        String(Math.floor(10 + Math.random() * 90));
      const created = await query(
        `INSERT INTO departments (name, code) VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [departmentName, code]
      );
      departmentId = created.rows[0]?.id;
    }
    if (!departmentId) continue;

    let managerId: string | null = null;
    if (managerEmail) {
      const mgrRes = await query(
        `SELECT id FROM employees WHERE LOWER(email) = $1 LIMIT 1`,
        [managerEmail]
      );
      managerId = mgrRes.rows[0]?.id ? String(mgrRes.rows[0].id) : null;
    }

    if (managerId) {
      await query(`UPDATE departments SET lead_employee_id = $1 WHERE id = $2`, [
        managerId,
        departmentId,
      ]);
    }

    const teamName = `${departmentName} Team`;
    const existingTeam = await query(
      `SELECT id FROM teams WHERE department_id = $1 AND name ILIKE $2 LIMIT 1`,
      [departmentId, teamName]
    );
    let teamId = existingTeam.rows[0]?.id as string | undefined;
    if (teamId) {
      await query(
        `UPDATE teams SET lead_employee_id = COALESCE($2, lead_employee_id) WHERE id = $1`,
        [teamId, managerId]
      );
    } else {
      const createdTeam = await query(
        `INSERT INTO teams (department_id, name, lead_employee_id)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [departmentId, teamName, managerId]
      );
      teamId = createdTeam.rows[0]?.id;
    }
    if (!teamId) continue;

    if (managerId) {
      await promoteEmployeeToManager(query, managerId);
      await query(
        `UPDATE employees
         SET department_id = $2,
             team_id = $3,
             reporting_manager_id = NULL
         WHERE id = $1`,
        [managerId, departmentId, teamId]
      );
    }

    for (const email of memberEmails) {
      if (managerEmail && email === managerEmail) continue;
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
}

const SETTINGS_KEYS = [
  'employment-types',
  'onboarding-fields',
  'general',
  'payroll',
  'attendance',
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

export const saveEmploymentTypes = settingsHandler('employment-types');
export const saveOnboardingFields = settingsHandler('onboarding-fields');
export const saveGeneralSettings = settingsHandler('general');
export const savePayrollSettings = settingsHandler('payroll');
export const saveAttendanceSettings = settingsHandler('attendance');

export async function getSettings(req: Request, res: Response): Promise<void> {
  try {
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
    const { name, code, address, latitude, longitude, geofenceRadiusMeters = 100, timezone = 'UTC' } = req.body;
    const latNum = Number(latitude) || 12.9279;
    const lngNum = Number(longitude) || 77.6271;
    const radiusNum = Math.round(Number(geofenceRadiusMeters)) || 100;
    const cleanCode = (code || (name || 'OFF').slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90)).toUpperCase().trim();

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
      [name, cleanCode, address || name, latNum, lngNum, radiusNum, timezone]
    );

    // Advance Status
    await advanceOnboardingStatus('OFFICE_SETUP', userSub, query, userEmail);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function setupDepartments(req: Request, res: Response): Promise<void> {
  try {
    const { departments } = req.body; // Array of { name, code }
    if (!Array.isArray(departments)) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'departments must be an array' } });
      return;
    }
    const userSub = (req as any).user?.sub;
    const userEmail = (req as any).user?.email;
    const query = req.tenantQuery!;
    
    const results = [];
    for (const dept of departments) {
      const { name, code } = dept;
      const cleanCode = (code || (name || 'DEP').slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90)).toUpperCase().trim();

      const result = await query(
        `INSERT INTO departments (name, code)
         VALUES ($1, $2)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [name, cleanCode]
      );
      results.push(result.rows[0]);
    }

    await advanceOnboardingStatus('DEPARTMENTS_SETUP', userSub, query, userEmail);
    res.status(201).json({ success: true, data: results });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function setupRoles(req: Request, res: Response): Promise<void> {
  try {
    const { roles } = req.body; // Array of { title, code, departmentId, level }
    if (!Array.isArray(roles)) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'roles must be an array' } });
      return;
    }
    const userSub = (req as any).user?.sub;
    const userEmail = (req as any).user?.email;
    const query = req.tenantQuery!;
    
    const results = [];
    for (const role of roles) {
      const { title, code, departmentId, level = 'L1' } = role;
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
    const { employees, completeOnboarding = false, assignments } = req.body;
    if (!Array.isArray(employees)) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'employees must be an array' } });
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

    // DB inserts + onboarding advance are atomic. Cognito runs after COMMIT.
    const inserted = await withTenantContext(schema, async (client, query) => {
      await client.query('BEGIN');
      try {
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
            role: rawRole,
          } = emp;

          const cleanEmail = (email || '').trim().toLowerCase();
          if (actorEmail && cleanEmail && cleanEmail === actorEmail) continue;

          const employeeCode = codes[codeIdx++] || (await allocateOneEmployeeCode(query));
          const resolvedRole = inferAuthRoleFromDesignation(designation, rawRole);

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
            const jobRole = await query('SELECT id FROM job_roles WHERE title ILIKE $1 LIMIT 1', [designation]);
            resolvedJobRoleId = jobRole.rows[0]?.id || null;
          }

          if (cleanEmail) {
            const existingAdmin = await query(
              `SELECT id FROM employees
                WHERE role = 'super_admin' AND LOWER(email) = $1
                LIMIT 1`,
              [cleanEmail]
            );
            if (existingAdmin.rows[0]) continue;
          }

          const result = await query(
            `INSERT INTO employees (
               employee_code, first_name, last_name, email, phone,
               office_id, department_id, job_role_id, role, employment_status, account_status,
               date_of_joining, has_completed_profile, onboarding_progress
             ) VALUES (
               $1, $2, $3, $4, $5,
               $6, $7, $8, $9, 'active', 'Not Activated',
               COALESCE($10::date, CURRENT_DATE), false, 0
             )
             ON CONFLICT (email) DO UPDATE SET
               office_id = EXCLUDED.office_id,
               department_id = EXCLUDED.department_id,
               job_role_id = EXCLUDED.job_role_id,
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
              tenantQuery: req.tenantQuery!,
            });
            created.cognito_sub = auth.cognitoSub;
            created.temporary_password = auth.temporaryPassword;
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
