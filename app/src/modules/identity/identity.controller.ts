import { Request, Response } from 'express';
import { pool } from '../../config/database.js';
import { hashPassword } from '../../utils/crypto.js';
import { provisionEmployeeAuth, isPlaceholderCognitoSub } from './provisionEmployeeAuth.js';
import { cognitoAdminSetUserPassword } from '../../config/cognito.js';
import { log } from '../../utils/logger.js';
import {
  canAccessEmployee,
  isOrgWideRole,
  resolveCallerEmployee,
} from '../../utils/employeeScope.js';
import { scheduleRepairSetupEmployees } from './employeeProvisionRepair.js';
import {
  authRoleFromJobLevel,
  inferAuthRoleFromDesignation,
  isFounderEmployeeCode,
  normalizeAuthRole,
} from '../../utils/roles.js';
import {
  resolveDefaultReportingManagerId,
  syncReportingHierarchy,
} from '../../utils/reportingHierarchy.js';
import { ensureLeadTables, getLeadIds, setDepartmentLeads } from '../../utils/orgLeads.js';
import { ensureDepartmentByName } from '../../utils/orgUpsert.js';
import { sendEmail } from '../../config/ses.js';
import { employeeInfoUpdatedEmail } from '../../emails/templates.js';
import { LicenseError, assertCanAddEmployees } from '../licenses/license.service.js';

const BANK_KEYS = ['account_holder_name', 'account_number', 'bank_name', 'routing_or_ifsc_code'];
const PAY_KEYS = [
  'base_salary',
  'hra',
  'special_allowance',
  'conveyance_allowance',
  'medical_allowance',
  'other_allowances',
  'allowances',
  'provident_fund_deduction',
  'tax_deduction',
];

function redactSensitiveEmployee(
  row: any,
  opts: { canSeeBank: boolean; canSeePay: boolean }
): any {
  if (!row) return row;
  const next = { ...row };
  if (!opts.canSeeBank) {
    for (const key of BANK_KEYS) next[key] = null;
  }
  if (!opts.canSeePay) {
    for (const key of PAY_KEYS) next[key] = null;
  }
  return next;
}

async function ensureEmployeeExtraColumns(query: (sql: string, params?: any[]) => Promise<any>): Promise<void> {
  try {
    await query(`
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type VARCHAR(64) DEFAULT 'Full-time';
      ALTER TABLE employees ADD COLUMN IF NOT EXISTS bio TEXT;
    `);
  } catch (_) {}
}

async function notifyEmployeeOfInfoChange(input: {
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>;
  employee: any;
  actorName?: string;
}): Promise<void> {
  const email = String(input.employee?.email || '').trim();
  // Skip in-app noise for routine profile edits; email alone is enough for awareness.
  if (!email) return;
  try {
    const rendered = employeeInfoUpdatedEmail({
      firstName: input.employee.first_name || input.employee.firstName,
      actorName: input.actorName,
    });
    await sendEmail({ to: email, subject: rendered.subject, html: rendered.html, text: rendered.text });
  } catch (err) {
    log.warn(`Could not email profile-update notice to ${email}`, err);
  }
}

async function attachExtraManagers(
  query: (sql: string, params?: any[]) => Promise<{ rows: any[] }>,
  employeeId: string,
  departmentId: string | null,
  managerIds: unknown
): Promise<void> {
  if (!departmentId || !Array.isArray(managerIds) || managerIds.length === 0) return;
  const extras = managerIds.map((id) => String(id || '').trim()).filter(Boolean);
  if (!extras.length) return;
  const current = await getLeadIds(query, 'department', departmentId);
  await setDepartmentLeads(query, departmentId, [...new Set([...current, ...extras])]);
}
import {
  attachOfficesToEmployeeRow,
  fetchEmployeeOfficesMap,
  fetchOfficesForEmployee,
  resolveOfficeIdsFromPayload,
  syncEmployeeOffices,
} from './employeeOffices.js';

export async function getEmployees(req: Request, res: Response): Promise<void> {
  try {
    // Detect SETUP-* / missing Cognito users and repair in the background so the list stays fast.
    try {
      const probe = await req.tenantQuery!(
        `SELECT 1 FROM employees
         WHERE employee_code ILIKE 'SETUP-%'
            OR (
              role IS DISTINCT FROM 'super_admin'
              AND email IS NOT NULL AND TRIM(email) <> ''
              AND (cognito_sub IS NULL OR cognito_sub = '' OR cognito_sub LIKE 'sub_dev_%' OR cognito_sub LIKE 'user_%')
            )
         LIMIT 1`
      );
      if (probe.rows.length > 0) {
        scheduleRepairSetupEmployees(req);
      }
    } catch (repairErr: any) {
      log.warn('Employee list repair skipped', repairErr);
    }

    const { departmentId, role, status } = req.query;
    await ensureLeadTables(req.tenantQuery!);
    await ensureEmployeeExtraColumns(req.tenantQuery!);
    // Directory list is org-wide for any authenticated tenant user.
    // Deep access (getById / update) still uses getAccessScope via canAccessEmployee.
    let sql = `
      SELECT 
        e.*,
        d.name as department_name,
        o.name as office_name,
        j.title as job_title,
        t.name as team_name,
        t.lead_employee_id as team_lead_id,
        COALESCE((
          SELECT array_agg(DISTINCT x.employee_id::text)
          FROM (
            SELECT dl.employee_id FROM department_leads dl WHERE dl.department_id = e.department_id
            UNION
            SELECT tl.employee_id FROM team_leads tl WHERE tl.team_id = e.team_id
          ) x
          WHERE x.employee_id <> e.id
        ), ARRAY[]::text[]) as co_manager_ids,
        TRIM(COALESCE(mgr.first_name, '') || ' ' || COALESCE(NULLIF(mgr.last_name, 'User'), mgr.last_name, '')) as reporting_manager_name,
        TRIM(COALESCE(tlead.first_name, '') || ' ' || COALESCE(NULLIF(tlead.last_name, 'User'), tlead.last_name, '')) as team_manager_name,
        b.account_holder_name,
        b.account_number,
        b.bank_name,
        b.routing_or_ifsc_code,
        s.base_salary,
        s.hra,
        s.special_allowance,
        s.conveyance_allowance,
        s.medical_allowance,
        s.other_allowances,
        s.allowances,
        s.provident_fund_deduction,
        s.tax_deduction
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN offices o ON e.office_id = o.id
      LEFT JOIN job_roles j ON e.job_role_id = j.id
      LEFT JOIN teams t ON e.team_id = t.id
      LEFT JOIN employees mgr ON e.reporting_manager_id = mgr.id
      LEFT JOIN employees tlead ON t.lead_employee_id = tlead.id
      LEFT JOIN bank_details b ON e.id = b.employee_id
      LEFT JOIN salary_structures s ON e.id = s.employee_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (departmentId) {
      params.push(departmentId);
      sql += ` AND e.department_id = $${params.length}`;
    }
    if (role) {
      params.push(role);
      sql += ` AND e.role = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND e.employment_status = $${params.length}`;
    }

    sql += ` ORDER BY e.created_at DESC`;

    const result = await req.tenantQuery!(sql, params);
    const employeeIds = result.rows.map((r: any) => String(r.id));
    const officesMap = await fetchEmployeeOfficesMap(req.tenantQuery!, employeeIds);
    const orgWide = isOrgWideRole(req.user?.role);
    const me = await resolveCallerEmployee(req).catch(() => null);
    const meId = me?.id ? String(me.id) : '';

    const mappedRows = result.rows.map((row: any) => {
      const isSuper = row.role === 'super_admin' || row.employee_code === 'EMP001';
      let resolvedStatus = isSuper ? 'Active' : (row.account_status || 'Not Activated');
      if (resolvedStatus === 'Activated') resolvedStatus = 'Active';
      const isDeactivated = resolvedStatus === 'Deactivated' || resolvedStatus === 'Suspended' || resolvedStatus === 'Terminated';
      const isActivated = resolvedStatus !== 'Not Activated' && !isDeactivated;
      const cleanedLastName = row.last_name === 'User' ? '' : row.last_name;
      const explicitProfile =
        row.has_completed_profile === true || row.has_completed_profile === false
          ? Boolean(row.has_completed_profile)
          : null;
      // Explicit flags win; null + already Active = legacy complete; null + Not Activated = incomplete
      const hasCompletedProfile = isSuper
        ? true
        : explicitProfile !== null
          ? explicitProfile
          : isActivated;
      const onboardingProgress = isSuper
        ? 100
        : row.onboarding_progress !== undefined && row.onboarding_progress !== null
          ? Number(row.onboarding_progress)
          : hasCompletedProfile
            ? 100
            : 0;

      let offices = officesMap.get(String(row.id)) || [];
      // Legacy fallback: single office_id with no junction rows yet
      if (offices.length === 0 && row.office_id) {
        offices = [
          {
            id: String(row.office_id),
            name: String(row.office_name || ''),
            isPrimary: true,
          },
        ];
      }

      const isSelf = meId && String(row.id) === meId;
      return attachOfficesToEmployeeRow(
        redactSensitiveEmployee(
          {
            ...row,
            last_name: cleanedLastName,
            account_status: resolvedStatus,
            is_activated: isActivated,
            is_deactivated: isDeactivated,
            has_completed_profile: hasCompletedProfile,
            onboarding_progress: onboardingProgress,
            job_title: row.job_title || (isSuper ? 'Founder & CEO' : null),
          },
          { canSeeBank: orgWide || Boolean(isSelf), canSeePay: orgWide }
        ),
        offices
      );
    });
    res.json({ success: true, data: mappedRows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getEmployeeById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const access = await canAccessEmployee(req, id);
    if (!access.target) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }
    if (!access.ok) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to this employee' },
      });
      return;
    }

    await ensureLeadTables(req.tenantQuery!);
    const result = await req.tenantQuery!(
      `SELECT 
        e.*,
        d.name as department_name,
        o.name as office_name,
        j.title as job_title,
        t.name as team_name,
        t.lead_employee_id as team_lead_id,
        COALESCE((
          SELECT array_agg(DISTINCT x.employee_id::text)
          FROM (
            SELECT dl.employee_id FROM department_leads dl WHERE dl.department_id = e.department_id
            UNION
            SELECT tl.employee_id FROM team_leads tl WHERE tl.team_id = e.team_id
          ) x
          WHERE x.employee_id <> e.id
        ), ARRAY[]::text[]) as co_manager_ids,
        TRIM(COALESCE(mgr.first_name, '') || ' ' || COALESCE(NULLIF(mgr.last_name, 'User'), mgr.last_name, '')) as reporting_manager_name,
        TRIM(COALESCE(tlead.first_name, '') || ' ' || COALESCE(NULLIF(tlead.last_name, 'User'), tlead.last_name, '')) as team_manager_name,
        b.account_holder_name,
        b.account_number,
        b.bank_name,
        b.routing_or_ifsc_code,
        s.base_salary,
        s.hra,
        s.special_allowance,
        s.conveyance_allowance,
        s.medical_allowance,
        s.other_allowances,
        s.allowances,
        s.provident_fund_deduction,
        s.tax_deduction
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       LEFT JOIN offices o ON e.office_id = o.id
       LEFT JOIN job_roles j ON e.job_role_id = j.id
       LEFT JOIN teams t ON e.team_id = t.id
       LEFT JOIN employees mgr ON e.reporting_manager_id = mgr.id
       LEFT JOIN employees tlead ON t.lead_employee_id = tlead.id
       LEFT JOIN bank_details b ON e.id = b.employee_id
       LEFT JOIN salary_structures s ON e.id = s.employee_id
       WHERE e.id = $1`,
      [access.target.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }

    const row = result.rows[0];
    const isSuper = row.role === 'super_admin' || row.employee_code === 'EMP001';
    let resolvedStatus = isSuper ? 'Active' : (row.account_status || 'Not Activated');
    if (resolvedStatus === 'Activated') resolvedStatus = 'Active';
    const isDeactivated = resolvedStatus === 'Deactivated' || resolvedStatus === 'Suspended' || resolvedStatus === 'Terminated';
    const isActivated = resolvedStatus !== 'Not Activated' && !isDeactivated;
    const explicitProfile =
      row.has_completed_profile === true || row.has_completed_profile === false
        ? Boolean(row.has_completed_profile)
        : null;
    const hasCompletedProfile = isSuper
      ? true
      : explicitProfile !== null
        ? explicitProfile
        : isActivated;
    const onboardingProgress = isSuper
      ? 100
      : row.onboarding_progress !== undefined && row.onboarding_progress !== null
        ? Number(row.onboarding_progress)
        : hasCompletedProfile
          ? 100
          : 0;
    const orgWide = isOrgWideRole(req.user?.role);
    const isSelf = access.scope.meId && String(row.id) === String(access.scope.meId);
    const mapped = redactSensitiveEmployee(
      {
        ...row,
        last_name: row.last_name === 'User' ? '' : row.last_name,
        account_status: resolvedStatus,
        is_activated: isActivated,
        is_deactivated: isDeactivated,
        has_completed_profile: hasCompletedProfile,
        onboarding_progress: onboardingProgress,
        job_title: row.job_title || (isSuper ? 'Founder & CEO' : null),
      },
      { canSeeBank: orgWide || Boolean(isSelf), canSeePay: orgWide }
    );

    let offices = await fetchOfficesForEmployee(req.tenantQuery!, String(row.id));
    if (offices.length === 0 && row.office_id) {
      offices = [
        {
          id: String(row.office_id),
          name: String(row.office_name || ''),
          isPrimary: true,
        },
      ];
    }

    res.json({ success: true, data: attachOfficesToEmployeeRow(mapped, offices) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

function parseDateOrNull(val: any): string | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed === 'null' || trimmed === 'undefined') return null;
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return null;
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  return null;
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  try {
    try {
      await assertCanAddEmployees(req.tenant?.id || req.user?.tenant_id || '', 1);
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
    const {
      employeeCode,
      firstName,
      lastName,
      email,
      phone,
      officeId,
      officeName,
      location,
      officeIds,
      departmentId,
      department,
      teamId,
      jobRoleId,
      designation,
      jobTitle,
      reportingManagerId,
      managerId,
      managerIds,
      role: rawRole = 'employee',
      dateOfJoining,
      employmentType,
      avatar,
    } = req.body;

    let role = inferAuthRoleFromDesignation(designation || jobTitle, rawRole);

    const cleanEmail = email ? String(email).trim().toLowerCase() : '';
    const cleanPhone = phone ? String(phone).trim() : '';
    const cleanFirstName = (firstName || '').trim();
    const cleanLastName = (lastName || '').trim();
    const cleanFullName = `${cleanFirstName} ${cleanLastName}`.trim().toLowerCase();

    let resolvedEmployeeCode = String(employeeCode || '').trim();
    if (!resolvedEmployeeCode || /^SETUP-/i.test(resolvedEmployeeCode)) {
      const codeRes = await req.tenantQuery!(`SELECT employee_code FROM employees WHERE employee_code IS NOT NULL`);
      let max = 0;
      for (const row of codeRes.rows) {
        const match = String(row.employee_code || '').match(/^(?:EMP|SETUP)-?0*(\d+)$/i);
        if (match) max = Math.max(max, parseInt(match[1], 10));
      }
      resolvedEmployeeCode = `EMP-${String(max + 1).padStart(3, '0')}`;
    }

    // Prevent creation of duplicate employee matching email, phone, or name+email
    if (cleanEmail || cleanPhone) {
      const dupCheck = await req.tenantQuery!(
        `SELECT id, first_name, last_name, email, phone FROM employees 
         WHERE (LOWER(email) = $1 AND $1 != '')
            OR (phone = $2 AND $2 != '')
            OR (LOWER(CONCAT(first_name, ' ', last_name)) = $3 AND LOWER(email) = $1 AND $3 != '')
         LIMIT 1`,
        [cleanEmail, cleanPhone, cleanFullName]
      );
      if (dupCheck.rows.length > 0) {
        const dup = dupCheck.rows[0];
        res.status(400).json({
          success: false,
          error: {
            code: 'DUPLICATE_EMPLOYEE',
            message: `An employee matching these details (${dup.first_name} ${dup.last_name}, email: ${dup.email}) already exists.`,
          },
        });
        return;
      }
    }

    let validOfficeId = officeId;
    let validDeptId = departmentId;
    let validJobRoleId = jobRoleId;

    const resolvedOffices = await resolveOfficeIdsFromPayload(req.tenantQuery!, {
      officeIds,
      officeId,
      officeName,
      location,
    });
    if (resolvedOffices.primaryOfficeId) {
      validOfficeId = resolvedOffices.primaryOfficeId;
    } else if (officeId?.startsWith?.('00000000')) {
      const off = await req.tenantQuery!('SELECT id FROM offices LIMIT 1');
      if (off.rows[0]) validOfficeId = off.rows[0].id;
    }

    if (department && (!validDeptId || String(validDeptId).startsWith('00000000'))) {
      validDeptId = (await ensureDepartmentByName(req.tenantQuery!, department)).id;
    } else if (departmentId?.startsWith('00000000')) {
      const dep = await req.tenantQuery!('SELECT id FROM departments LIMIT 1');
      if (dep.rows[0]) validDeptId = dep.rows[0].id;
    }

    const titleVal = designation || jobTitle;
    if (titleVal && (!validJobRoleId || String(validJobRoleId).startsWith('00000000'))) {
      const jbCheck = await req.tenantQuery!('SELECT id FROM job_roles WHERE title ILIKE $1 LIMIT 1', [titleVal]);
      if (jbCheck.rows[0]) {
        validJobRoleId = jbCheck.rows[0].id;
      } else {
        const code = titleVal.slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90);
        const newJb = await req.tenantQuery!('INSERT INTO job_roles (title, code) VALUES ($1, $2) RETURNING id', [titleVal, code]);
        validJobRoleId = newJb.rows[0].id;
      }
    } else if (jobRoleId?.startsWith('00000000')) {
      const jb = await req.tenantQuery!('SELECT id FROM job_roles LIMIT 1');
      if (jb.rows[0]) validJobRoleId = jb.rows[0].id;
    }

    if (validJobRoleId) {
      const jobLevel = await req.tenantQuery!('SELECT level FROM job_roles WHERE id = $1 LIMIT 1', [validJobRoleId]);
      const fromLevel = authRoleFromJobLevel(jobLevel.rows[0]?.level);
      if (fromLevel) role = fromLevel;
    }

    try {
      await req.tenantQuery!(`
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar TEXT;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      `);
    } catch (_) {}
    await ensureEmployeeExtraColumns(req.tenantQuery!);

    const cleanEmploymentType = String(employmentType || 'Full-time').trim() || 'Full-time';

    const incomingManager = reportingManagerId !== undefined ? reportingManagerId : managerId;
    const explicitManager =
      incomingManager && String(incomingManager).trim() !== '' && !String(incomingManager).startsWith('00000000')
        ? String(incomingManager)
        : null;
    const resolvedManagerId =
      explicitManager ||
      (await resolveDefaultReportingManagerId(req.tenantQuery!, {
        departmentId: validDeptId || null,
        teamId: teamId || null,
        role,
        jobTitle: titleVal,
      }));

    const result = await req.tenantQuery!(
      `INSERT INTO employees (
        employee_code, first_name, last_name, email, phone, office_id, department_id, team_id, job_role_id, reporting_manager_id, role, date_of_joining, account_status, avatar, avatar_url, employment_type
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14, $15)
       RETURNING *`,
      [
        resolvedEmployeeCode,
        firstName,
        lastName,
        email,
        phone || null,
        validOfficeId || null,
        validDeptId || null,
        teamId || null,
        validJobRoleId || null,
        resolvedManagerId || null,
        role,
        parseDateOrNull(dateOfJoining) || new Date().toISOString().split('T')[0],
        (req.body.accountStatus as string) || (req.body.account_status as string) || 'Not Activated',
        avatar || null,
        cleanEmploymentType,
      ]
    );

    const createdEmp = result.rows[0];

    try {
      await syncReportingHierarchy(req.tenantQuery!, {
        skipEmployeeIds: explicitManager ? [String(createdEmp.id)] : [],
      });
    } catch (hierErr) {
      log.warn('Could not sync reporting hierarchy for new employee', hierErr);
    }

    // Sync multi-office assignments (also covers single office from officeName/officeId)
    try {
      const idsToSync =
        resolvedOffices.officeIds.length > 0
          ? resolvedOffices.officeIds
          : validOfficeId
            ? [String(validOfficeId)]
            : [];
      if (idsToSync.length > 0) {
        await syncEmployeeOffices(
          req.tenantQuery!,
          createdEmp.id,
          idsToSync,
          resolvedOffices.primaryOfficeId || validOfficeId || idsToSync[0]
        );
      }
    } catch (officeSyncErr) {
      log.warn('Could not sync employee offices for new employee', officeSyncErr);
    }

    try {
      const extraMgrs = Array.isArray(managerIds) ? managerIds : [];
      await attachExtraManagers(req.tenantQuery!, createdEmp.id, validDeptId || null, extraMgrs);
    } catch (mgrErr) {
      log.warn('Could not attach extra managers for new employee', mgrErr);
    }

    // Provision Cognito + global auth mapping, then email the employee a setup link
    try {
      const cleanEmailForAuth = email ? email.trim().toLowerCase() : '';
      if (cleanEmailForAuth) {
        const auth = await provisionEmployeeAuth({
          employeeId: createdEmp.id,
          email: cleanEmailForAuth,
          firstName,
          lastName,
          role: role || 'employee',
          tenantId: req.tenant?.id,
          schemaName: req.dbSchema || req.tenantId,
          tenantSlug: req.tenant?.slug,
          sendInvite: req.body.sendInvite !== false,
          invitedBy: req.user?.name,
          tenantQuery: req.tenantQuery!,
        });
        createdEmp.cognito_sub = auth.cognitoSub;
        if (auth.inviteSent) createdEmp.account_status = 'Invited';
        (createdEmp as any).invite_sent = auth.inviteSent;
      }
    } catch (authSyncErr) {
      log.warn('Could not provision Cognito auth for new employee', authSyncErr);
    }

    const offices = await fetchOfficesForEmployee(req.tenantQuery!, String(createdEmp.id));
    res.status(201).json({ success: true, data: attachOfficesToEmployeeRow(createdEmp, offices) });
  } catch (err: any) {
    console.error('Error creating employee:', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      email,
      password,
      isActivated,
      isDeactivated: rawIsDeactivated,
      accountStatus,
      hasCompletedProfile,
      onboardingProgress,
      phone,
      officeId,
      officeName,
      location,
      officeIds,
      departmentId,
      department,
      teamId,
      jobRoleId,
      designation,
      jobTitle,
      reportingManagerId: rawReportingManagerId,
      managerId,
      managerIds,
      role,
      employmentType,
      employmentStatus: rawEmploymentStatus,
      status,
      dateOfJoining,
      dateOfBirth,
      gender,
      bloodGroup,
      maritalStatus,
      nationality,
      primaryAddress,
      city,
      stateProvince,
      postalCode,
      country,
      personalTaxId,
      socialInsurance,
      healthInsurance,
      emergencyContact,
      customFieldValues,
      uploadedDocuments,
      avatar,
      bio,
    } = req.body;

    const reportingManagerId = rawReportingManagerId !== undefined ? rawReportingManagerId : managerId;
    const employmentStatus = rawEmploymentStatus !== undefined ? rawEmploymentStatus : (status ? (String(status).toLowerCase() === 'probation' ? 'on_probation' : String(status).toLowerCase()) : undefined);

    const access = await canAccessEmployee(req, id);
    if (!access.target) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }
    if (!access.ok) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to update this employee' },
      });
      return;
    }

    const empCheck = await req.tenantQuery!(
      'SELECT * FROM employees WHERE id = $1 LIMIT 1',
      [access.target.id]
    );
    if (empCheck.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }
    const emp = empCheck.rows[0];
    const orgWide = isOrgWideRole(req.user?.role);

    // Non-admin callers may only edit their own profile (managers cannot edit reports here).
    if (!orgWide && access.scope.meId && String(emp.id) !== String(access.scope.meId)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Employees may only update their own profile' },
      });
      return;
    }

    // Ensure columns exist in tenant schema
    try {
      await req.tenantQuery!(`
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth DATE;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS gender VARCHAR(32);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS blood_group VARCHAR(16);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS marital_status VARCHAR(32);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality VARCHAR(64);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS primary_address TEXT;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS city VARCHAR(64);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS state_province VARCHAR(64);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS postal_code VARCHAR(32);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS country VARCHAR(64);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_tax_id VARCHAR(64);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS social_insurance VARCHAR(64);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS health_insurance VARCHAR(128);
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_contact JSONB;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS custom_field_values JSONB;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS uploaded_documents JSONB;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar TEXT;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS bio TEXT;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_status VARCHAR(32) DEFAULT 'Not Activated';
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_completed_profile BOOLEAN DEFAULT false;
        ALTER TABLE employees ADD COLUMN IF NOT EXISTS onboarding_progress INTEGER DEFAULT 0;
      `);
    } catch (_) {}
    await ensureEmployeeExtraColumns(req.tenantQuery!);

    let validDeptId = departmentId !== undefined ? departmentId : emp.department_id;
    if (department && (!validDeptId || String(validDeptId).startsWith('00000000'))) {
      validDeptId = (await ensureDepartmentByName(req.tenantQuery!, department)).id;
    }

    let validJobRoleId = jobRoleId !== undefined ? jobRoleId : emp.job_role_id;
    const titleVal = designation || jobTitle;
    if (titleVal && (!validJobRoleId || String(validJobRoleId).startsWith('00000000'))) {
      const jbCheck = await req.tenantQuery!('SELECT id FROM job_roles WHERE title ILIKE $1 LIMIT 1', [titleVal]);
      if (jbCheck.rows[0]) {
        validJobRoleId = jbCheck.rows[0].id;
      } else {
        const code = titleVal.slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90);
        const newJb = await req.tenantQuery!('INSERT INTO job_roles (title, code) VALUES ($1, $2) RETURNING id', [titleVal, code]);
        validJobRoleId = newJb.rows[0].id;
      }
    }

    let validOfficeId = officeId !== undefined ? officeId : emp.office_id;
    const officePayloadProvided =
      officeIds !== undefined ||
      officeId !== undefined ||
      officeName !== undefined ||
      location !== undefined;

    let resolvedUpdateOffices: { officeIds: string[]; primaryOfficeId: string | null } | null = null;
    if (orgWide && officePayloadProvided) {
      resolvedUpdateOffices = await resolveOfficeIdsFromPayload(req.tenantQuery!, {
        officeIds,
        officeId: officeId !== undefined ? officeId : undefined,
        officeName,
        location,
      });
      // Always re-resolve when officeName/officeIds provided — even if employee already has office_id
      if (resolvedUpdateOffices.primaryOfficeId) {
        validOfficeId = resolvedUpdateOffices.primaryOfficeId;
      } else if (Array.isArray(officeIds) && officeIds.length === 0) {
        validOfficeId = null;
      }
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (firstName !== undefined) {
      values.push(firstName);
      updates.push(`first_name = $${values.length}`);
    }
    if (lastName !== undefined) {
      values.push(lastName);
      updates.push(`last_name = $${values.length}`);
    }
    if (email !== undefined) {
      values.push(email);
      updates.push(`email = $${values.length}`);
    }
    if (phone !== undefined) {
      values.push(phone);
      updates.push(`phone = $${values.length}`);
    }
    // Org assignment / role changes are admin & HR only
    if (orgWide && officePayloadProvided) {
      const cleanOfficeId =
        validOfficeId && String(validOfficeId).trim() !== '' && !String(validOfficeId).startsWith('00000000')
          ? validOfficeId
          : null;
      values.push(cleanOfficeId);
      updates.push(`office_id = $${values.length}`);
    }
    if (orgWide && validDeptId !== undefined) {
      const cleanDeptId = validDeptId && String(validDeptId).trim() !== '' && !String(validDeptId).startsWith('00000000') ? validDeptId : null;
      values.push(cleanDeptId);
      updates.push(`department_id = $${values.length}`);
    }
    if (orgWide && teamId !== undefined) {
      const cleanTeamId = teamId && String(teamId).trim() !== '' && !String(teamId).startsWith('00000000') ? teamId : null;
      values.push(cleanTeamId);
      updates.push(`team_id = $${values.length}`);
    }
    if (orgWide && validJobRoleId !== undefined) {
      const cleanJobRoleId = validJobRoleId && String(validJobRoleId).trim() !== '' && !String(validJobRoleId).startsWith('00000000') ? validJobRoleId : null;
      values.push(cleanJobRoleId);
      updates.push(`job_role_id = $${values.length}`);
    }
    if (orgWide && reportingManagerId !== undefined) {
      const cleanMgrId = reportingManagerId && String(reportingManagerId).trim() !== '' && !String(reportingManagerId).startsWith('00000000') ? reportingManagerId : null;
      values.push(cleanMgrId);
      updates.push(`reporting_manager_id = $${values.length}`);
    }
    if (orgWide && role !== undefined) {
      values.push(normalizeAuthRole(role));
      updates.push(`role = $${values.length}`);
    } else if (orgWide && validJobRoleId && !String(validJobRoleId).startsWith('00000000') && !isFounderEmployeeCode(emp.employee_code)) {
      const jobLevel = await req.tenantQuery!('SELECT level FROM job_roles WHERE id = $1 LIMIT 1', [validJobRoleId]);
      const fromLevel = authRoleFromJobLevel(jobLevel.rows[0]?.level);
      if (fromLevel && fromLevel !== emp.role) {
        values.push(fromLevel);
        updates.push(`role = $${values.length}`);
      }
    }
    if (orgWide && employmentStatus !== undefined) {
      values.push(employmentStatus);
      updates.push(`employment_status = $${values.length}`);
    }
    if (orgWide && employmentType !== undefined) {
      values.push(String(employmentType || 'Full-time').trim() || 'Full-time');
      updates.push(`employment_type = $${values.length}`);
    }
    if (orgWide && dateOfJoining !== undefined) {
      const cleanJoining = parseDateOrNull(dateOfJoining);
      if (cleanJoining) {
        values.push(cleanJoining);
        updates.push(`date_of_joining = $${values.length}`);
      }
    }
    if (dateOfBirth !== undefined) {
      const cleanDOB = parseDateOrNull(dateOfBirth);
      values.push(cleanDOB);
      updates.push(`date_of_birth = $${values.length}`);
    }
    if (gender !== undefined) {
      const cleanGender =
        gender === null || gender === '' || gender === '—' || gender === 'None' ? null : gender;
      values.push(cleanGender);
      updates.push(`gender = $${values.length}`);
    }
    if (bloodGroup !== undefined) {
      values.push(bloodGroup);
      updates.push(`blood_group = $${values.length}`);
    }
    if (maritalStatus !== undefined) {
      values.push(maritalStatus);
      updates.push(`marital_status = $${values.length}`);
    }
    if (nationality !== undefined) {
      values.push(nationality);
      updates.push(`nationality = $${values.length}`);
    }
    if (primaryAddress !== undefined) {
      values.push(primaryAddress);
      updates.push(`primary_address = $${values.length}`);
    }
    if (city !== undefined) {
      values.push(city);
      updates.push(`city = $${values.length}`);
    }
    if (stateProvince !== undefined) {
      values.push(stateProvince);
      updates.push(`state_province = $${values.length}`);
    }
    if (postalCode !== undefined) {
      values.push(postalCode);
      updates.push(`postal_code = $${values.length}`);
    }
    if (country !== undefined) {
      values.push(country);
      updates.push(`country = $${values.length}`);
    }
    if (personalTaxId !== undefined) {
      values.push(personalTaxId);
      updates.push(`personal_tax_id = $${values.length}`);
    }
    if (socialInsurance !== undefined) {
      values.push(socialInsurance);
      updates.push(`social_insurance = $${values.length}`);
    }
    if (healthInsurance !== undefined) {
      values.push(healthInsurance || null);
      updates.push(`health_insurance = $${values.length}`);
    }
    if (emergencyContact !== undefined) {
      if (emergencyContact === null || emergencyContact === '' || emergencyContact === '—') {
        values.push(null);
        updates.push(`emergency_contact = $${values.length}`);
      } else {
        const jsonStr = typeof emergencyContact === 'object' ? JSON.stringify(emergencyContact) : String(emergencyContact).trim();
        try {
          JSON.parse(jsonStr);
          values.push(jsonStr);
          updates.push(`emergency_contact = $${values.length}::jsonb`);
        } catch (_) {
          values.push(JSON.stringify(emergencyContact));
          updates.push(`emergency_contact = $${values.length}::jsonb`);
        }
      }
    }
    if (customFieldValues !== undefined) {
      if (customFieldValues === null || customFieldValues === '' || customFieldValues === '—') {
        values.push(null);
        updates.push(`custom_field_values = $${values.length}`);
      } else {
        const jsonStr = typeof customFieldValues === 'object' ? JSON.stringify(customFieldValues) : String(customFieldValues).trim();
        try {
          JSON.parse(jsonStr);
          values.push(jsonStr);
          updates.push(`custom_field_values = $${values.length}::jsonb`);
        } catch (_) {
          values.push(JSON.stringify(customFieldValues));
          updates.push(`custom_field_values = $${values.length}::jsonb`);
        }
      }
    }
    if (uploadedDocuments !== undefined) {
      if (uploadedDocuments === null || uploadedDocuments === '' || uploadedDocuments === '—') {
        values.push(null);
        updates.push(`uploaded_documents = $${values.length}`);
      } else {
        const jsonStr = typeof uploadedDocuments === 'object' ? JSON.stringify(uploadedDocuments) : String(uploadedDocuments).trim();
        try {
          JSON.parse(jsonStr);
          values.push(jsonStr);
          updates.push(`uploaded_documents = $${values.length}::jsonb`);
        } catch (_) {
          values.push(JSON.stringify(uploadedDocuments));
          updates.push(`uploaded_documents = $${values.length}::jsonb`);
        }
      }
    }
    if (avatar !== undefined) {
      values.push(avatar || null);
      updates.push(`avatar = $${values.length}`);
      // Keep schema avatar_url in sync — auth /me and login read it
      updates.push(`avatar_url = $${values.length}`);
    }
    if (bio !== undefined) {
      const cleaned = bio === null || bio === '' ? null : String(bio).trim() || null;
      values.push(cleaned);
      updates.push(`bio = $${values.length}`);
    }
    const incomingStatus = accountStatus || status;
    const isSelfUpdate =
      !!access.scope.meId && String(emp.id) === String(access.scope.meId);
    // Self may activate own account on onboarding complete; deactivate/suspend stay org-wide only
    const canSetActiveStatus = orgWide || isSelfUpdate;
    if (orgWide && incomingStatus !== undefined) {
      const normalized =
        incomingStatus === 'Activated' ? 'Active' : incomingStatus;
      values.push(normalized);
      updates.push(`account_status = $${values.length}`);
    } else if (orgWide && rawIsDeactivated === true) {
      values.push('Deactivated');
      updates.push(`account_status = $${values.length}`);
    } else if (canSetActiveStatus && isActivated === true) {
      values.push('Active');
      updates.push(`account_status = $${values.length}`);
    } else if (
      isSelfUpdate &&
      (incomingStatus === 'Active' || incomingStatus === 'Activated')
    ) {
      values.push('Active');
      updates.push(`account_status = $${values.length}`);
    }
    if (hasCompletedProfile !== undefined) {
      values.push(Boolean(hasCompletedProfile));
      updates.push(`has_completed_profile = $${values.length}`);
    }
    if (onboardingProgress !== undefined) {
      values.push(Number(onboardingProgress));
      updates.push(`onboarding_progress = $${values.length}`);
    }

    // Sync credentials & activation status into public.global_auth_mapping
    try {
      const cleanEmail = (email || emp.email || '').trim().toLowerCase();
      if (cleanEmail) {
        const tenantRes = await pool.query(
          'SELECT id FROM public.tenants WHERE schema_name = $1 OR slug = $2 LIMIT 1',
          [req.dbSchema, req.tenantId]
        );
        let tenantUuid = tenantRes.rows[0]?.id;
        if (!tenantUuid) {
          const firstTenant = await pool.query('SELECT id FROM public.tenants LIMIT 1');
          tenantUuid = firstTenant.rows[0]?.id || null;
        }

        const isDeactivated =
          rawIsDeactivated === true ||
          accountStatus === 'Deactivated' ||
          accountStatus === 'Terminated' ||
          employmentStatus === 'terminated' ||
          employmentStatus === 'suspended' ||
          status === 'Deactivated' ||
          status === 'Terminated' ||
          status === 'Suspended';

        if (password && typeof password === 'string' && password.trim().length >= 4) {
          const cleanPassword = password.trim();
          const passwordHash = hashPassword(cleanPassword);

          // Login is Cognito-backed — always sync the real Cognito password (and create
          // the user if setup/provisioning previously failed).
          try {
            if (!emp.cognito_sub || isPlaceholderCognitoSub(emp.cognito_sub)) {
              const auth = await provisionEmployeeAuth({
                employeeId: emp.id,
                email: cleanEmail,
                firstName: firstName || emp.first_name,
                lastName: lastName || emp.last_name,
                role: role || emp.role || 'employee',
                password: cleanPassword,
                tenantId: req.tenant?.id || tenantUuid,
                tenantSlug: req.tenant?.slug,
                schemaName: req.dbSchema || req.tenant?.schema,
                tenantQuery: req.tenantQuery!,
              });
              emp.cognito_sub = auth.cognitoSub;
            } else {
              await cognitoAdminSetUserPassword({
                username: cleanEmail,
                password: cleanPassword,
                permanent: true,
              });
            }
          } catch (cognitoPwdErr: any) {
            log.warn(`Cognito password sync failed for ${cleanEmail}`, cognitoPwdErr);
          }

          const existingAuth = await pool.query(
            'SELECT id FROM public.global_auth_mapping WHERE LOWER(email) = $1 LIMIT 1',
            [cleanEmail]
          );

          const shouldBeActive = !isDeactivated;
          const cognitoSubForMapping = emp.cognito_sub || `user_${emp.id}`;

          if (existingAuth.rows.length > 0) {
            await pool.query(
              'UPDATE public.global_auth_mapping SET password_hash = $1, is_active = $2, cognito_sub = COALESCE(NULLIF(cognito_sub, \'\'), $3), role = COALESCE($4, role) WHERE id = $5',
              [passwordHash, shouldBeActive, cognitoSubForMapping, role || emp.role || 'employee', existingAuth.rows[0].id]
            );
          } else if (tenantUuid) {
            await pool.query(
              `INSERT INTO public.global_auth_mapping (cognito_sub, email, password_hash, tenant_id, role, is_active)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = EXCLUDED.is_active`,
              [cognitoSubForMapping, cleanEmail, passwordHash, tenantUuid, role || emp.role || 'employee', shouldBeActive]
            );
          }
        } else if (isDeactivated) {
          await pool.query(
            'UPDATE public.global_auth_mapping SET is_active = false WHERE LOWER(email) = $1',
            [cleanEmail]
          );
        } else if (!isDeactivated) {
          await pool.query(
            'UPDATE public.global_auth_mapping SET is_active = true WHERE LOWER(email) = $1',
            [cleanEmail]
          );
        }
      }
    } catch (authSyncErr) {
      console.warn('Could not sync global auth mapping for employee update:', authSyncErr);
    }

    if (updates.length === 0) {
      if (orgWide && officePayloadProvided && resolvedUpdateOffices) {
        try {
          await syncEmployeeOffices(
            req.tenantQuery!,
            emp.id,
            resolvedUpdateOffices.officeIds,
            resolvedUpdateOffices.primaryOfficeId
          );
        } catch (officeSyncErr) {
          log.warn('Could not sync employee offices on empty update', officeSyncErr);
        }
        const offices = await fetchOfficesForEmployee(req.tenantQuery!, String(emp.id));
        res.json({ success: true, data: attachOfficesToEmployeeRow(emp, offices) });
        return;
      }
      res.json({ success: true, data: emp });
      return;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(emp.id);

    const query = `
      UPDATE employees
      SET ${updates.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `;

    const result = await req.tenantQuery!(query, values);
    let updated = result.rows[0];

    try {
      const previousDeptLeads: Record<string, string | null> = {};
      if (emp.department_id) {
        const oldLeadRes = await req.tenantQuery!(
          `SELECT lead_employee_id FROM departments WHERE id = $1 LIMIT 1`,
          [emp.department_id]
        );
        previousDeptLeads[String(emp.department_id)] = oldLeadRes.rows[0]?.lead_employee_id
          ? String(oldLeadRes.rows[0].lead_employee_id)
          : null;
      }
      await syncReportingHierarchy(req.tenantQuery!, {
        previousDeptLeads,
        skipEmployeeIds: reportingManagerId !== undefined ? [String(emp.id)] : [],
      });
      const afterHier = await req.tenantQuery!(`SELECT * FROM employees WHERE id = $1`, [emp.id]);
      if (afterHier.rows[0]) updated = afterHier.rows[0];
    } catch (hierErr) {
      log.warn('Could not sync reporting hierarchy on employee update', hierErr);
    }

    if (orgWide && officePayloadProvided && resolvedUpdateOffices) {
      try {
        await syncEmployeeOffices(
          req.tenantQuery!,
          emp.id,
          resolvedUpdateOffices.officeIds,
          resolvedUpdateOffices.primaryOfficeId
        );
        // Re-read primary office_id after sync
        const refreshed = await req.tenantQuery!(`SELECT * FROM employees WHERE id = $1`, [emp.id]);
        if (refreshed.rows[0]) updated = refreshed.rows[0];
      } catch (officeSyncErr) {
        log.warn('Could not sync employee offices on update', officeSyncErr);
      }
    }

    if (orgWide && Array.isArray(managerIds)) {
      try {
        await attachExtraManagers(
          req.tenantQuery!,
          String(emp.id),
          updated.department_id || validDeptId || null,
          managerIds
        );
      } catch (mgrErr) {
        log.warn('Could not attach extra managers on employee update', mgrErr);
      }
    }

    if (orgWide && access.scope.meId && String(emp.id) !== String(access.scope.meId)) {
      void notifyEmployeeOfInfoChange({
        query: req.tenantQuery!,
        employee: updated,
        actorName: req.user?.name || req.user?.email,
      });
    }

    const offices = await fetchOfficesForEmployee(req.tenantQuery!, String(emp.id));
    res.json({ success: true, data: attachOfficesToEmployeeRow(updated, offices) });
  } catch (err: any) {
    console.error('Error updating employee:', err);
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateBankDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { accountHolderName, accountNumber, bankName, routingOrIfscCode } = req.body;

    const access = await canAccessEmployee(req, id);
    if (!access.target) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
      return;
    }
    if (!access.ok) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You do not have access to update bank details for this employee' },
      });
      return;
    }

    const orgWide = isOrgWideRole(req.user?.role);
    const isSelf = access.scope.meId && String(access.target.id) === String(access.scope.meId);
    if (!orgWide && !isSelf) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Bank details are only visible to HR, admin, and the employee' },
      });
      return;
    }

    const empCheck = await req.tenantQuery!(
      'SELECT id, first_name, last_name FROM employees WHERE id = $1 LIMIT 1',
      [access.target.id]
    );
    const validEmpId = empCheck.rows[0]?.id || access.target.id;
    const defaultHolder = empCheck.rows[0] ? `${empCheck.rows[0].first_name || ''} ${empCheck.rows[0].last_name || ''}`.trim() : 'Employee';

    const cleanHolder = (accountHolderName || defaultHolder || 'Employee').trim();
    const cleanAcc = (accountNumber || '—').trim();
    const cleanBank = (bankName || 'Bank').trim();
    const cleanIfsc = (routingOrIfscCode || '—').trim();

    const result = await req.tenantQuery!(
      `INSERT INTO bank_details (employee_id, account_holder_name, account_number, bank_name, routing_or_ifsc_code)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (employee_id) DO UPDATE SET
         account_holder_name = EXCLUDED.account_holder_name,
         account_number = EXCLUDED.account_number,
         bank_name = EXCLUDED.bank_name,
         routing_or_ifsc_code = EXCLUDED.routing_or_ifsc_code,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [validEmpId, cleanHolder, cleanAcc, cleanBank, cleanIfsc]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
