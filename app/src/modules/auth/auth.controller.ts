import { Request, Response } from 'express';
import { pool } from '../../config/database.js';
import { provisionTenantSchema } from '../../db/migrator.js';
import { sanitizeSchemaName } from '../../db/queryRunner.js';
import { cognitoSignUp, cognitoLogin, cognitoRefreshToken } from '../../config/cognito.js';
import { isEmailRegistered, verifyEmailVerificationToken } from './emailFlows.controller.js';
import { hashPassword, signJwt, verifyPassword } from '../../utils/crypto.js';
import { log } from '../../utils/logger.js';
import { isFounderEmployeeCode, pickEffectiveAuthRole } from '../../utils/roles.js';
import { ensureOwnerOrgDefaults } from '../../utils/orgDefaults.js';
import { getPlanByIdOrKey, issueLicense, syncAndSummarizeLicense } from '../licenses/license.service.js';

export interface PasswordValidationResult {
  isValid: boolean;
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
  score: number;
  message?: string;
}

/**
 * Validates password against standard AWS Cognito User Pool password policies:
 * - Minimum 8 characters
 * - At least 1 uppercase letter (A-Z)
 * - At least 1 lowercase letter (a-z)
 * - At least 1 number (0-9)
 * - At least 1 special character (!@#$%^&*...)
 */
export function validateCognitoPassword(password: string): PasswordValidationResult {
  const p = password || '';
  const hasMinLength = p.length >= 8;
  const hasUppercase = /[A-Z]/.test(p);
  const hasLowercase = /[a-z]/.test(p);
  const hasNumber = /[0-9]/.test(p);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>\-_+=\[\]~`\/\\;']/.test(p);

  const passedCount = [hasMinLength, hasUppercase, hasLowercase, hasNumber, hasSpecialChar].filter(Boolean).length;
  const isValid = passedCount === 5;

  let message: string | undefined;
  if (!isValid) {
    const missing: string[] = [];
    if (!hasMinLength) missing.push('at least 8 characters');
    if (!hasUppercase) missing.push('one uppercase letter (A-Z)');
    if (!hasLowercase) missing.push('one lowercase letter (a-z)');
    if (!hasNumber) missing.push('one number (0-9)');
    if (!hasSpecialChar) missing.push('one special symbol (!@#$%^&*)');
    message = `Password does not meet AWS Cognito requirements. Missing: ${missing.join(', ')}.`;
  }

  return {
    isValid,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
    score: passedCount,
    message,
  };
}

function readTenantAddress(body: Record<string, unknown>) {
  const address = String(body.address || body.streetAddress || '').trim();
  const city = String(body.city || '').trim();
  const stateProvince = String(body.stateProvince || body.state || '').trim();
  const postalCode = String(body.postalCode || body.zip || '').trim();
  const country = String(body.country || '').trim();
  return { address, city, stateProvince, postalCode, country };
}

function tenantAddressPayload(row: {
  address?: string | null;
  city?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  country?: string | null;
} | null | undefined) {
  if (!row) return {};
  return {
    address: row.address || '',
    city: row.city || '',
    stateProvince: row.state_province || '',
    postalCode: row.postal_code || '',
    country: row.country || '',
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const {
    name,
    adminName,
    email,
    adminEmail,
    password,
    adminPassword,
    tenantName,
    companyName,
    slug: customSlug,
    industry = 'Technology',
    contactPhone,
    designation,
    adminRoleTitle,
    planId,
    billingCycle,
  } = req.body;
  const tenantAddress = readTenantAddress(req.body || {});

  const resolvedName = (name || adminName || 'Administrator').trim();
  const resolvedEmail = (email || adminEmail || '').trim().toLowerCase();
  const resolvedPassword = password || adminPassword;
  const resolvedTenantName = (tenantName || companyName || '').trim();

  if (!resolvedTenantName || !resolvedEmail || !resolvedPassword) {
    log.warn('Registration Rejected: Missing required registration fields', {
      hasTenantName: Boolean(resolvedTenantName),
      hasEmail: Boolean(resolvedEmail),
      hasPassword: Boolean(resolvedPassword),
    });
    res.status(400).json({
      success: false,
      error: { code: 'BAD_REQUEST', message: 'Company/Tenant Name, Admin Email, and Password are required.' },
    });
    return;
  }

  if (!tenantAddress.address || !tenantAddress.city || !tenantAddress.country) {
    log.warn('Registration Rejected: Missing company address details', { email: resolvedEmail });
    res.status(400).json({
      success: false,
      error: {
        code: 'BAD_REQUEST',
        message: 'Company street address, city, and country are required.',
      },
    });
    return;
  }

  const selectedPlan = await getPlanByIdOrKey(pool, String(planId || '').trim());
  if (!selectedPlan || !selectedPlan.isActive || !selectedPlan.isPublic) {
    log.warn('Registration Rejected: Missing or invalid license plan', { planId });
    res.status(400).json({
      success: false,
      error: {
        code: 'PLAN_REQUIRED',
        message: 'Choose a license plan before creating your workspace.',
      },
    });
    return;
  }
  const selectedCycle = billingCycle === 'annual' ? 'annual' : 'monthly';

  if (!verifyEmailVerificationToken(req.body.verificationToken, resolvedEmail)) {
    log.warn('Registration Rejected: Email not verified', { email: resolvedEmail });
    res.status(403).json({
      success: false,
      error: {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address with the code we sent before creating your workspace.',
      },
    });
    return;
  }

  // Strict AWS Cognito Password Policy Validation
  const passwordValidation = validateCognitoPassword(resolvedPassword);
  if (!passwordValidation.isValid) {
    log.warn('Registration Rejected: Password does not meet AWS Cognito policy', {
      email: resolvedEmail,
      missing: passwordValidation.message,
    });
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PASSWORD',
        message: passwordValidation.message || 'Password must be at least 8 characters long with uppercase, lowercase, numbers, and symbols.',
        policy: {
          minLength: passwordValidation.hasMinLength,
          uppercase: passwordValidation.hasUppercase,
          lowercase: passwordValidation.hasLowercase,
          number: passwordValidation.hasNumber,
          specialChar: passwordValidation.hasSpecialChar,
        },
      },
    });
    return;
  }

  let client: any = null;
  try {
    client = await pool.connect();

    log.info(`Commencing Organization & Admin Registration for "${resolvedTenantName}"`, {
      adminEmail: resolvedEmail,
      industry,
    });

    if (await isEmailRegistered(resolvedEmail, client)) {
      log.warn('Registration Rejected: Email already registered', { email: resolvedEmail });
      res.status(409).json({
        success: false,
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'An account with this email address already exists. Please log in instead.',
        },
      });
      return;
    }

    // Generate unique, valid tenant slug and schema name
    let baseSlug = (customSlug || resolvedTenantName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);

    if (!baseSlug || baseSlug.length < 3) {
      baseSlug = `org_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    let tenantSlug = baseSlug;
    let schemaName = sanitizeSchemaName(`tenant_${tenantSlug}`);

    // Check if slug/schema already exists and append counter if collision occurs
    let counter = 1;
    while (true) {
      const existing = await client.query(
        'SELECT id FROM public.tenants WHERE slug = $1 OR schema_name = $2 LIMIT 1',
        [tenantSlug, schemaName]
      );
      if (existing.rows.length === 0) break;
      tenantSlug = `${baseSlug}_${counter++}`;
      schemaName = sanitizeSchemaName(`tenant_${tenantSlug}`);
    }

    // Step 1: Register User in AWS Cognito User Pool (or authenticate if user already registered)
    log.step(1, 4, 'Registering Admin Account in AWS Cognito', {
      email: resolvedEmail,
      tenantSlug,
      role: 'super_admin',
    });

    let userSub: string;
    let authTokens: any = null;

    try {
      const signUpResult = await cognitoSignUp({
        email: resolvedEmail,
        password: resolvedPassword,
        name: resolvedName,
        role: 'super_admin',
        tenantSlug,
      });
      userSub = signUpResult.userSub;

      // Attempt immediate login to obtain access/id tokens
      try {
        authTokens = await cognitoLogin({ email: resolvedEmail, password: resolvedPassword });
      } catch (_) {}
    } catch (signUpErr: any) {
      if (signUpErr.name === 'UsernameExistsException') {
        // Only reuse a Cognito user if this app has no mapping yet (failed first signup).
        // An existing mapping means the email is already taken.
        if (await isEmailRegistered(resolvedEmail, client)) {
          log.warn('Registration Rejected: Cognito user already mapped', { email: resolvedEmail });
          res.status(409).json({
            success: false,
            error: {
              code: 'USER_ALREADY_EXISTS',
              message: 'An account with this email address already exists. Please log in instead.',
            },
          });
          return;
        }
        log.info(`Cognito user "${resolvedEmail}" exists with no workspace mapping. Authenticating to finish registration...`);
        try {
          authTokens = await cognitoLogin({ email: resolvedEmail, password: resolvedPassword });
          userSub = authTokens.idToken || `sub_${Date.now()}`;
        } catch (loginErr: any) {
          res.status(409).json({
            success: false,
            error: {
              code: 'USER_ALREADY_EXISTS',
              message: 'An account with this email address already exists. Please log in instead.',
            },
          });
          return;
        }
      } else {
        throw signUpErr;
      }
    }

    // Step 2: Start PostgreSQL Transaction to register Tenant and Global Auth Record
    log.step(2, 4, 'Provisioning Tenant in PostgreSQL Control Plane', {
      tenantSlug,
      schemaName,
    });
    await client.query('BEGIN');

    if (await isEmailRegistered(resolvedEmail, client)) {
      await client.query('ROLLBACK');
      log.warn('Registration Rejected: Email already registered', { email: resolvedEmail });
      res.status(409).json({
        success: false,
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'An account with this email address already exists. Please log in instead.',
        },
      });
      return;
    }

    // Insert Tenant into public.tenants
    const tenantRes = await client.query(
      `INSERT INTO public.tenants (
         slug, name, schema_name, status, plan, admin_email, contact_phone, industry,
         address, city, state_province, postal_code, country
       )
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        tenantSlug,
        resolvedTenantName,
        schemaName,
        selectedPlan.key,
        resolvedEmail,
        contactPhone || null,
        industry,
        tenantAddress.address,
        tenantAddress.city,
        tenantAddress.stateProvince || null,
        tenantAddress.postalCode || null,
        tenantAddress.country,
      ]
    );
    const tenantRecord = tenantRes.rows[0];

    await issueLicense(client, {
      tenantId: tenantRecord.id,
      plan: selectedPlan,
      billingCycle: selectedCycle,
      actorEmail: resolvedEmail,
    });

    // Insert Global Auth Mapping for Cognito Sub <-> Tenant
    await client.query(
      `INSERT INTO public.global_auth_mapping (cognito_sub, email, tenant_id, role, is_active)
       VALUES ($1, $2, $3, 'super_admin', true)
       ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET
         is_active = true,
         role = 'super_admin'`,
      [userSub, resolvedEmail, tenantRecord.id]
    );

    await client.query('COMMIT');

    // Step 3â€“4: schema provision + admin seed. On failure, compensate control-plane rows.
    const compensateRegistration = async () => {
      try {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        await client.query('DELETE FROM public.global_auth_mapping WHERE tenant_id = $1', [tenantRecord.id]);
        await client.query('DELETE FROM public.tenant_subscriptions WHERE tenant_id = $1', [tenantRecord.id]);
        await client.query('DELETE FROM public.tenants WHERE id = $1', [tenantRecord.id]);
        log.warn(`Compensating cleanup removed tenant "${tenantSlug}" after provision failure`);
      } catch (cleanupErr: any) {
        log.error('Registration compensating cleanup failed', cleanupErr);
      }
    };

    try {
      log.step(3, 4, `Creating Isolated PostgreSQL Schema "${schemaName}"`);
      await provisionTenantSchema(schemaName);

      log.step(4, 4, `Seeding Root Admin Profile in Schema "${schemaName}"`);
      const nameParts = resolvedName.split(/\s+/);
      const firstName = nameParts[0] || 'Admin';
      const lastName = nameParts.slice(1).join(' ') || '';
      const resolvedAdminDesignation = designation || adminRoleTitle || 'Founder & CEO';

      await client.query(`SET search_path TO "${schemaName}", public`);
      try {
        const leadership = await ensureOwnerOrgDefaults(
          (text, params) => client.query(text, params),
          { industry, jobTitle: resolvedAdminDesignation }
        );

        await client.query(
          `INSERT INTO "${schemaName}".employees (
             cognito_sub, employee_code, first_name, last_name, email, phone,
             office_id, department_id, job_role_id, role, employment_status, account_status,
             date_of_joining, has_completed_profile, onboarding_progress, onboarding_status
           ) VALUES (
             $1, 'EMP001', $2, $3, $4, $5,
             NULL, $6, $7, 'super_admin', 'active', 'Activated',
             CURRENT_DATE, false, 0, 'NOT_STARTED'
           )
           ON CONFLICT (email) DO UPDATE SET
             cognito_sub = EXCLUDED.cognito_sub,
             department_id = COALESCE(EXCLUDED.department_id, "${schemaName}".employees.department_id),
             job_role_id = COALESCE(EXCLUDED.job_role_id, "${schemaName}".employees.job_role_id),
             role = 'super_admin',
             onboarding_status = 'NOT_STARTED',
             has_completed_profile = false,
             onboarding_progress = 0`,
          [userSub, firstName, lastName, resolvedEmail, contactPhone || null, leadership.departmentId, leadership.jobRoleId]
        );
      } finally {
        await client.query('RESET search_path');
      }

      log.success(`Tenant "${resolvedTenantName}" and Super Admin "${resolvedEmail}" fully initialized!`, {
        tenantSlug,
        schemaName,
        cognitoSub: userSub,
      });

      const sessionToken = authTokens?.idToken || authTokens?.accessToken || `cognito_${userSub}_${tenantRecord.slug}`;

      res.status(201).json({
        success: true,
        message: 'Tenant and administrator workspace provisioned successfully.',
        data: {
          token: sessionToken,
          tenant: {
            id: tenantRecord.id,
            slug: tenantRecord.slug,
            name: tenantRecord.name,
            schema: tenantRecord.schema_name,
            industry: tenantRecord.industry,
            ...tenantAddressPayload(tenantRecord),
            license: await syncAndSummarizeLicense(pool, tenantRecord.id, resolvedEmail),
          },
          user: {
            id: userSub,
            sub: userSub,
            name: resolvedName,
            email: resolvedEmail,
            role: 'super_admin',
            designation: resolvedAdminDesignation,
          },
        },
      });
      return;
    } catch (provisionErr: any) {
      await compensateRegistration();
      throw provisionErr;
    }
  } catch (err: any) {
    if (client) {
      await client.query('ROLLBACK').catch(() => {});
    }
    log.error('Tenant Registration Failed', err);

    if (err.name === 'UsernameExistsException' || err.code === '23505') {
      res.status(409).json({
        success: false,
        error: { code: 'USER_ALREADY_EXISTS', message: 'An account with this email address already exists. Please log in instead.' },
      });
      return;
    }

    if (err.name === 'InvalidPasswordException') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: err.message || 'Password must be at least 8 characters long with uppercase, lowercase, numbers, and symbols.' },
      });
      return;
    }

    if (err.name === 'InvalidParameterException') {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_PARAMETER', message: err.message || 'Invalid registration parameters provided.' },
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: { code: 'REGISTRATION_ERROR', message: err.message || 'An error occurred during tenant onboarding.' },
    });
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      log.warn('Login Rejected: Missing credentials');
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Email and password are required.' },
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    log.info(`Initiating authentication flow for "${cleanEmail}"`);

    // Platform operators may authenticate via control-plane password_hash (no Cognito user required)
    const platformMapping = await pool.query(
      `SELECT gam.*, t.id as tenant_uuid, t.slug as tenant_slug, t.name as tenant_name,
              t.schema_name, t.status as tenant_status, t.industry as tenant_industry
       FROM public.global_auth_mapping gam
       JOIN public.tenants t ON gam.tenant_id = t.id
       WHERE LOWER(gam.email) = $1 AND gam.role = 'platform_admin' AND gam.is_active = true
       LIMIT 1`,
      [cleanEmail]
    );
    if (platformMapping.rows[0]?.password_hash) {
      const row = platformMapping.rows[0];
      if (verifyPassword(password.trim(), row.password_hash)) {
        const token = signJwt(
          {
            sub: row.cognito_sub,
            email: cleanEmail,
            role: 'platform_admin',
            tenant_id: row.tenant_slug,
            db_schema: row.schema_name,
            name: cleanEmail.split('@')[0],
          },
          60 * 60 * 12
        );
        pool
          .query('UPDATE public.global_auth_mapping SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id])
          .catch(() => {});

        log.success(`Platform admin "${cleanEmail}" logged in via password_hash`);
        res.json({
          success: true,
          message: 'Login successful',
          data: {
            token,
            expiresIn: 60 * 60 * 12,
            tenant: {
              id: row.tenant_uuid,
              slug: row.tenant_slug,
              name: row.tenant_name,
              schema: row.schema_name,
              industry: row.tenant_industry || 'Platform',
            },
            user: {
              id: row.id,
              sub: row.cognito_sub,
              name: cleanEmail.split('@')[0],
              email: cleanEmail,
              role: 'platform_admin',
              department: 'Platform',
              designation: 'Platform Operator',
            },
          },
        });
        return;
      }
    }

    // 1. Authenticate via AWS Cognito (USER_PASSWORD_AUTH)
    const tokens = await cognitoLogin({ email: cleanEmail, password: password.trim() });

    // 2. Resolve user's tenant mapping and profile from PostgreSQL
    log.info(`Resolving tenant workspace for "${cleanEmail}" from Control Plane...`);
    let mappingRes = await pool.query(
      `SELECT gam.*, t.id as tenant_uuid, t.slug as tenant_slug, t.name as tenant_name, t.schema_name, t.status as tenant_status, t.industry as tenant_industry, t.admin_email as tenant_admin_email,
              t.address, t.city, t.state_province, t.postal_code, t.country
       FROM public.global_auth_mapping gam
       JOIN public.tenants t ON gam.tenant_id = t.id
       WHERE LOWER(gam.email) = $1
       ORDER BY gam.is_active DESC, gam.created_at DESC
       LIMIT 1`,
      [cleanEmail]
    );

    let authRecord = mappingRes.rows[0];

    // Fallback: If auth mapping missing for demo/existing tenant, resolve from tenant schema (Employees or Students)
    if (!authRecord) {
      log.info(`Checking tenant schemas for existing user "${cleanEmail}"...`);
      const tenants = await pool.query('SELECT id, slug, name, schema_name, status, industry, address, city, state_province, postal_code, country FROM public.tenants WHERE status != $1', ['decommissioned']);
      for (const t of tenants.rows) {
        try {
          // Check employee table
          const empCheck = await pool.query(
            `SELECT * FROM "${t.schema_name}".employees WHERE LOWER(email) = $1 LIMIT 1`,
            [cleanEmail]
          );
          if (empCheck.rows.length > 0) {
            const emp = empCheck.rows[0];
            const cognitoSub = emp.cognito_sub || `user_${emp.id}`;

            const inserted = await pool.query(
              `INSERT INTO public.global_auth_mapping (cognito_sub, email, tenant_id, role, is_active)
               VALUES ($1, $2, $3, $4, true)
               ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET is_active = true
               RETURNING *`,
              [cognitoSub, cleanEmail, t.id, emp.role || 'employee']
            );

            authRecord = {
              ...inserted.rows[0],
              tenant_uuid: t.id,
              tenant_slug: t.slug,
              tenant_name: t.name,
              schema_name: t.schema_name,
              tenant_status: t.status,
              tenant_industry: t.industry,
              address: t.address,
              city: t.city,
              state_province: t.state_province,
              postal_code: t.postal_code,
              country: t.country,
            };
            break;
          }

          // Check student table (by email, student_id, or roll_number)
          const studentCheck = await pool.query(
            `SELECT * FROM "${t.schema_name}".students 
             WHERE LOWER(email) = $1 OR LOWER(student_id) = $1 OR LOWER(roll_number) = $1
             LIMIT 1`,
            [cleanEmail]
          );
          if (studentCheck.rows.length > 0) {
            const stu = studentCheck.rows[0];
            const cognitoSub = `student_${stu.id}`;

            const inserted = await pool.query(
              `INSERT INTO public.global_auth_mapping (cognito_sub, email, tenant_id, role, is_active)
               VALUES ($1, $2, $3, 'student', true)
               ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET is_active = true
               RETURNING *`,
              [cognitoSub, cleanEmail, t.id]
            );

            authRecord = {
              ...inserted.rows[0],
              tenant_uuid: t.id,
              tenant_slug: t.slug,
              tenant_name: t.name,
              schema_name: t.schema_name,
              tenant_status: t.status,
              tenant_industry: t.industry || 'Institute',
              address: t.address,
              city: t.city,
              state_province: t.state_province,
              postal_code: t.postal_code,
              country: t.country,
            };
            break;
          }
        } catch (_) {}
      }
    }

    if (!authRecord) {
      log.warn(`Login Denied: No tenant workspace found for user "${cleanEmail}"`);
      res.status(404).json({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'No registered workspace tenant associated with this user.' },
      });
      return;
    }

    if (authRecord.tenant_status === 'suspended') {
      log.warn(`Login Denied: Tenant workspace "${authRecord.tenant_slug}" is suspended`);
      res.status(403).json({
        success: false,
        error: { code: 'TENANT_SUSPENDED', message: 'Your organization workspace is currently suspended.' },
      });
      return;
    }

    if (authRecord.is_active === false) {
      log.warn(`Login Denied: Account "${cleanEmail}" is deactivated`);
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_DEACTIVATED', message: 'Your account has been deactivated. Please contact your workspace administrator.' },
      });
      return;
    }

    // 3. Fetch profile from tenant schema (Employee or Student)
    const schema = authRecord.schema_name;
    let employee: any = null;
    let student: any = null;

    try {
      const empRes = await pool.query(
        `SELECT e.*, d.name as department_name, jr.title as job_title
         FROM "${schema}".employees e
         LEFT JOIN "${schema}".departments d ON e.department_id = d.id
         LEFT JOIN "${schema}".job_roles jr ON e.job_role_id = jr.id
         WHERE LOWER(e.email) = $1
         LIMIT 1`,
        [cleanEmail]
      );
      if (empRes.rows.length > 0) {
        employee = empRes.rows[0];
      }
    } catch (empErr: any) {
      log.warn(`Notice: Could not load employee row from schema ${schema}`, { error: empErr.message });
    }

    if (!employee) {
      try {
        const stuRes = await pool.query(
          `SELECT s.*, b.grade as batch_grade, b.section as batch_section
           FROM "${schema}".students s
           LEFT JOIN "${schema}".academic_batches b ON s.batch_id = b.id
           WHERE LOWER(s.email) = $1 OR LOWER(s.student_id) = $1 OR LOWER(s.roll_number) = $1
           LIMIT 1`,
          [cleanEmail]
        );
        if (stuRes.rows.length > 0) {
          student = stuRes.rows[0];
        }
      } catch (_) {}
    }

    if (employee) {
      const accStatus = String(employee.account_status || '').trim().toLowerCase();
      if (accStatus === 'suspended' || accStatus === 'deactivated' || accStatus === 'terminated') {
        log.warn(`Login Denied: Employee status is "${accStatus}"`);
        res.status(403).json({
          success: false,
          error: {
            code: accStatus === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_DEACTIVATED',
            message: `Your account is ${accStatus}. Please contact your administrator.`,
          },
        });
        return;
      }

      // Activate employee if logging in for the first time (must await so post-login sync sees Active)
      if (accStatus === 'not activated' || accStatus === 'invited') {
        try {
          await pool.query(
            `UPDATE "${schema}".employees
             SET account_status = 'Active',
                 last_name = CASE WHEN last_name = 'User' THEN '' ELSE last_name END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [employee.id]
          );
          employee.account_status = 'Active';
          if (employee.last_name === 'User') employee.last_name = '';
        } catch (err) {
          log.warn('Could not update employee status to Active', err);
        }
      } else if (employee.last_name === 'User') {
        // Clear historical setup-wizard placeholder last name
        pool.query(
          `UPDATE "${schema}".employees SET last_name = '', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND last_name = 'User'`,
          [employee.id]
        ).catch(err => log.warn('Could not clear placeholder last_name', err));
        employee.last_name = '';
      }
    }

    // Update last login timestamp
    pool.query(
      'UPDATE public.global_auth_mapping SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [authRecord.id]
    ).catch(err => log.warn('Could not update last login timestamp', err));

    let resolvedFullName: string;
    let resolvedRole: string = authRecord.role;
    let resolvedDepartment: string = 'General Operations';
    let resolvedDesignation: string = 'Team Member';
    let resolvedOnboardingStatus: string | undefined;
    let resolvedHasCompletedProfile: boolean | undefined;
    let resolvedOnboardingProgress: number | undefined;

    if (student) {
      resolvedFullName = `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.student_id;
      resolvedRole = 'student';
      resolvedDepartment = student.batch_grade ? `${student.batch_grade}${student.batch_section ? ' â€¢ Sec ' + student.batch_section : ''}` : (student.grade || 'Academic');
      resolvedDesignation = student.roll_number ? `Roll: ${student.roll_number}` : 'Student';
    } else if (employee) {
      const first = String(employee.first_name || '').trim();
      const last = String(employee.last_name || '').trim();
      // Ignore historical setup placeholder "User" when no real last name was provided
      resolvedFullName = `${first}${last && last !== 'User' ? ` ${last}` : ''}`.trim() || first;
      const founderRole =
        String(authRecord.admin_email || authRecord.tenant_admin_email || '').trim().toLowerCase() === cleanEmail ||
        isFounderEmployeeCode(employee.employee_code)
          ? 'super_admin'
          : undefined;
      if (authRecord.role === 'platform_admin') {
        resolvedRole = 'platform_admin';
      } else {
        resolvedRole = pickEffectiveAuthRole([authRecord.role, founderRole, employee.role]);
        if (authRecord.role && authRecord.role !== resolvedRole) {
          pool
            .query('UPDATE public.global_auth_mapping SET role = $1 WHERE id = $2', [
              resolvedRole,
              authRecord.id,
            ])
            .catch((err) => log.warn('Could not sync global_auth_mapping role', err));
        }
        if (resolvedRole === 'super_admin' && employee.role !== 'super_admin') {
          pool
            .query(
              `UPDATE "${schema}".employees SET role = 'super_admin', updated_at = CURRENT_TIMESTAMP
               WHERE id = $1 AND role IS DISTINCT FROM 'super_admin'`,
              [employee.id]
            )
            .catch((err) => log.warn('Could not restore workspace owner role', err));
        }
      }
      resolvedDepartment = employee.department_name || (resolvedRole === 'super_admin' ? 'Management' : 'General Operations');
      resolvedDesignation = employee.job_title || employee.designation || (resolvedRole === 'super_admin' ? 'Founder & CEO' : 'Team Member');
      resolvedOnboardingStatus = employee.onboarding_status || undefined;
      resolvedHasCompletedProfile =
        employee.has_completed_profile === true || employee.has_completed_profile === false
          ? Boolean(employee.has_completed_profile)
          : undefined;
      resolvedOnboardingProgress =
        employee.onboarding_progress !== undefined && employee.onboarding_progress !== null
          ? Number(employee.onboarding_progress)
          : undefined;
    } else {
      resolvedFullName = authRecord.email.split('@')[0];
    }

    log.success(`User "${cleanEmail}" logged in successfully!`, {
      tenant: authRecord.tenant_slug,
      schema: authRecord.schema_name,
      role: resolvedRole,
      name: resolvedFullName,
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: tokens.idToken,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
        tenant: {
          id: authRecord.tenant_uuid,
          slug: authRecord.tenant_slug,
          name: authRecord.tenant_name,
          schema: authRecord.schema_name,
          industry: authRecord.tenant_industry || 'Office',
          ...tenantAddressPayload(authRecord),
          license: authRecord.tenant_uuid
            ? await syncAndSummarizeLicense(pool, authRecord.tenant_uuid, cleanEmail)
            : null,
        },
        user: {
          id: student?.id || employee?.id || authRecord.id,
          sub: authRecord.cognito_sub,
          name: resolvedFullName,
          email: authRecord.email,
          role: resolvedRole,
          department: resolvedDepartment,
          designation: resolvedDesignation,
          avatar: student?.avatar_url || employee?.avatar || employee?.avatar_url || undefined,
          onboardingStatus: resolvedOnboardingStatus || (resolvedRole === 'super_admin' ? 'NOT_STARTED' : undefined),
          onboarding_status: resolvedOnboardingStatus || (resolvedRole === 'super_admin' ? 'NOT_STARTED' : undefined),
          hasCompletedProfile: resolvedHasCompletedProfile,
          onboardingProgress: resolvedOnboardingProgress,
        },
      },
    });
  } catch (err: any) {
    log.error('User Authentication Failed', err);
    const isInvalid =
      err.name === 'NotAuthorizedException' ||
      err.name === 'UserNotFoundException' ||
      err.message?.includes('Incorrect') ||
      err.message?.includes('Invalid');

    res.status(isInvalid ? 401 : 500).json({
      success: false,
      error: {
        code: isInvalid ? 'INVALID_CREDENTIALS' : 'SERVER_ERROR',
        message: isInvalid ? 'Incorrect email or password.' : (err.message || 'Authentication error.'),
      },
    });
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.body.refreshToken || req.body.token;

    if (!refreshToken) {
      log.warn('Token Refresh Rejected: Missing refresh token');
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'refreshToken is required.' },
      });
      return;
    }

    log.info('Refreshing AWS Cognito session tokens...');
    const refreshed = await cognitoRefreshToken(refreshToken);
    log.success('AWS Cognito session refreshed successfully.');

    res.json({
      success: true,
      message: 'Token refreshed successfully.',
      data: {
        token: refreshed.idToken,
        accessToken: refreshed.accessToken,
        expiresIn: refreshed.expiresIn,
      },
    });
  } catch (err: any) {
    log.error('Token Refresh Failed', err);
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_REFRESH_TOKEN', message: err.message || 'Invalid or expired refresh token.' },
    });
  }
}

/**
 * DB-backed student login (no Cognito).
 * Looks up students by email / roll / student_id across tenant schemas,
 * verifies password_hash (PBKDF2), and returns an app-signed JWT.
 */
export async function studentLogin(req: Request, res: Response): Promise<void> {
  try {
    const { email, identifier, password, tenantSlug } = req.body || {};
    const cleanId = String(identifier || email || '')
      .trim()
      .toLowerCase();
    const cleanPassword = String(password || '').trim();

    if (!cleanId || !cleanPassword) {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Student identifier and password are required.' },
      });
      return;
    }

    log.info(`Initiating student authentication for "${cleanId}"`);

    const tenantsQuery = tenantSlug
      ? await pool.query(
          'SELECT id, slug, name, schema_name, status, industry FROM public.tenants WHERE LOWER(slug) = $1 AND status != $2 LIMIT 1',
          [String(tenantSlug).trim().toLowerCase(), 'decommissioned']
        )
      : await pool.query(
          'SELECT id, slug, name, schema_name, status, industry FROM public.tenants WHERE status != $1',
          ['decommissioned']
        );

    let matchedTenant: any = null;
    let student: any = null;

    for (const t of tenantsQuery.rows) {
      try {
        const stuRes = await pool.query(
          `SELECT s.*, b.grade as batch_grade, b.section as batch_section
           FROM "${t.schema_name}".students s
           LEFT JOIN "${t.schema_name}".academic_batches b ON s.batch_id = b.id
           WHERE LOWER(s.email) = $1
              OR LOWER(COALESCE(s.student_id, '')) = $1
              OR LOWER(COALESCE(s.roll_number, '')) = $1
           LIMIT 1`,
          [cleanId]
        );
        if (stuRes.rows.length > 0) {
          matchedTenant = t;
          student = stuRes.rows[0];
          break;
        }
      } catch (_) {
        // schema may lack institute tables â€” skip
      }
    }

    if (!matchedTenant || !student) {
      log.warn(`Student login denied: no student found for "${cleanId}"`);
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
      });
      return;
    }

    if (matchedTenant.status === 'suspended') {
      res.status(403).json({
        success: false,
        error: { code: 'TENANT_SUSPENDED', message: 'Your organization workspace is currently suspended.' },
      });
      return;
    }

    let passwordHash = student.password_hash as string | null;
    // Lazy-hydrate default password (roll number) when enroll omitted a hash
    if (!passwordHash) {
      const defaultPwd = String(student.roll_number || student.student_id || '').trim();
      if (defaultPwd && cleanPassword === defaultPwd) {
        passwordHash = hashPassword(defaultPwd);
        try {
          await pool.query(
            `UPDATE "${matchedTenant.schema_name}".students
             SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [passwordHash, student.id]
          );
        } catch (err: any) {
          log.warn('Could not backfill student password_hash', { error: err.message });
        }
      }
    }

    if (!verifyPassword(cleanPassword, passwordHash)) {
      log.warn(`Student login denied: bad password for "${cleanId}"`);
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
      });
      return;
    }

    const status = String(student.status || student.account_status || '').trim().toLowerCase();
    if (status === 'suspended' || status === 'deactivated' || status === 'inactive' || status === 'terminated') {
      res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_DEACTIVATED', message: 'Your student account is not active.' },
      });
      return;
    }

    const studentEmail = String(student.email || '').trim().toLowerCase() || cleanId;
    const cognitoSub = `student_${student.id}`;
    const fullName =
      `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
      student.student_id ||
      'Student';
    const department = student.batch_grade
      ? `${student.batch_grade}${student.batch_section ? ' â€¢ Sec ' + student.batch_section : ''}`
      : student.grade || 'Academic';
    const designation = student.roll_number ? `Roll: ${student.roll_number}` : 'Student';

    // Ensure control-plane mapping exists for middleware /me resolution
    try {
      await pool.query(
        `INSERT INTO public.global_auth_mapping (cognito_sub, email, tenant_id, role, is_active, last_login_at)
         VALUES ($1, $2, $3, 'student', true, CURRENT_TIMESTAMP)
         ON CONFLICT (cognito_sub, tenant_id) DO UPDATE
           SET is_active = true, email = EXCLUDED.email, last_login_at = CURRENT_TIMESTAMP`,
        [cognitoSub, studentEmail, matchedTenant.id]
      );
    } catch (mapErr: any) {
      log.warn('Could not upsert student global_auth_mapping', { error: mapErr.message });
    }

    const token = signJwt({
      sub: cognitoSub,
      email: studentEmail,
      role: 'student',
      tenant_id: matchedTenant.slug,
      db_schema: matchedTenant.schema_name,
      name: fullName,
      student_id: student.id,
    });

    log.success(`Student "${studentEmail}" logged in successfully`, {
      tenant: matchedTenant.slug,
      schema: matchedTenant.schema_name,
    });

    res.json({
      success: true,
      message: 'Student login successful',
      data: {
        token,
        tenant: {
          id: matchedTenant.id,
          slug: matchedTenant.slug,
          name: matchedTenant.name,
          schema: matchedTenant.schema_name,
          industry: matchedTenant.industry || 'Institute',
        },
        user: {
          id: student.id,
          sub: cognitoSub,
          name: fullName,
          email: studentEmail,
          role: 'student',
          department,
          designation,
          avatar: student.avatar_url || undefined,
          rollNumber: student.roll_number || undefined,
          studentId: student.student_id || undefined,
        },
      },
    });
  } catch (err: any) {
    log.error('Student Authentication Failed', err);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message || 'Authentication error.' },
    });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      log.warn('GET /me Rejected: No user session on request');
      res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not authenticated.' },
      });
      return;
    }

    const schema = req.tenant?.schema || req.dbSchema;
    let employeeData = null;
    let studentData = null;

    if (schema && schema !== 'public') {
      try {
        const empRes = await pool.query(
          `SELECT e.*, d.name as department_name, jr.title as job_title
           FROM "${schema}".employees e
           LEFT JOIN "${schema}".departments d ON e.department_id = d.id
           LEFT JOIN "${schema}".job_roles jr ON e.job_role_id = jr.id
           WHERE LOWER(e.email) = $1 OR e.cognito_sub = $2
           LIMIT 1`,
          [req.user.email?.toLowerCase(), req.user.sub]
        );
        if (empRes.rows.length > 0) {
          employeeData = empRes.rows[0];
        }
      } catch (err: any) {
        log.warn(`Could not load employee details for ${req.user.email} from ${schema}`, err);
      }

      if (!employeeData && (req.user.role === 'student' || String(req.user.sub || '').startsWith('student_'))) {
        try {
          const stuRes = await pool.query(
            `SELECT s.*, b.grade as batch_grade, b.section as batch_section
             FROM "${schema}".students s
             LEFT JOIN "${schema}".academic_batches b ON s.batch_id = b.id
             WHERE LOWER(s.email) = $1
                OR s.id::text = $2
                OR ('student_' || s.id::text) = $2
             LIMIT 1`,
            [req.user.email?.toLowerCase(), req.user.sub]
          );
          if (stuRes.rows.length > 0) {
            studentData = stuRes.rows[0];
          }
        } catch (err: any) {
          log.warn(`Could not load student details for ${req.user.email} from ${schema}`, err);
        }
      }
    }

    const studentName = studentData
      ? `${studentData.first_name || ''} ${studentData.last_name || ''}`.trim() || studentData.student_id
      : null;
    const studentDept = studentData?.batch_grade
      ? `${studentData.batch_grade}${studentData.batch_section ? ' â€¢ Sec ' + studentData.batch_section : ''}`
      : studentData?.grade || undefined;

    res.json({
      success: true,
      data: {
        user: {
          ...req.user,
          id: studentData?.id || employeeData?.id || req.user.sub,
          employeeId: employeeData?.id || undefined,
          name: employeeData
            ? (() => {
                const first = String(employeeData.first_name || '').trim();
                const last = String(employeeData.last_name || '').trim();
                return `${first}${last && last !== 'User' ? ` ${last}` : ''}`.trim() || first || req.user.name;
              })()
            : studentName || req.user.name,
          role: studentData
            ? 'student'
            : req.user.role === 'platform_admin'
              ? 'platform_admin'
              : employeeData?.role || req.user.role,
          designation: employeeData?.job_title
            || (studentData?.roll_number ? `Roll: ${studentData.roll_number}` : undefined)
            || (req.user.role === 'platform_admin' ? 'Platform Operator' : undefined)
            || (req.user.role === 'super_admin' ? 'Founder & CEO' : studentData ? 'Student' : 'Team Member'),
          department: employeeData?.department_name || studentDept || (req.user.role === 'platform_admin' ? 'Platform' : 'Management'),
          avatar: employeeData?.avatar || employeeData?.avatar_url || studentData?.avatar_url || undefined,
          onboardingStatus: employeeData?.onboarding_status || 'NOT_STARTED',
          onboarding_status: employeeData?.onboarding_status || 'NOT_STARTED',
          hasCompletedProfile:
            employeeData?.has_completed_profile === true || employeeData?.has_completed_profile === false
              ? Boolean(employeeData.has_completed_profile)
              : employeeData?.role === 'super_admin'
                ? true
                : undefined,
          onboardingProgress:
            employeeData?.onboarding_progress !== undefined && employeeData?.onboarding_progress !== null
              ? Number(employeeData.onboarding_progress)
              : employeeData?.role === 'super_admin'
                ? 100
                : undefined,
        },
        tenant: {
          ...(req.tenant || {
            id: req.user.tenant_id,
            schema: req.user.db_schema,
            userSub: req.user.sub,
          }),
          license:
            req.user.role === 'platform_admin'
              ? null
              : await syncAndSummarizeLicense(pool, req.tenant?.id || req.user.tenant_id, req.user.email),
        },
      },
    });
  } catch (err: any) {
    log.error('GET /me Failed', err);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: err.message },
    });
  }
}
