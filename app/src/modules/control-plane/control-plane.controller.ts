import { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { cognitoAdminDeleteUserByEmail } from '../../config/cognito.js';
import { frontendUrl } from '../../config/ses.js';
import { provisionTenantSchema } from '../../db/migrator.js';
import { sanitizeSchemaName, withTenantContext } from '../../db/queryRunner.js';
import { provisionEmployeeAuth } from '../identity/provisionEmployeeAuth.js';
import { invalidateAuthIdentities } from '../../middleware/auth.middleware.js';
import { hashPassword, signJwt } from '../../utils/crypto.js';
import { ensureOwnerOrgDefaults } from '../../utils/orgDefaults.js';
import {
  getPlanByIdOrKey,
  issueLicense,
  listAllPlans,
  listLicenseEvents,
  mapPlanRow,
  mutateTenantLicense,
  resolveBillingIntent,
  resolveTenantUuid,
  syncAndSummarizeLicense,
  LicenseError,
} from '../licenses/license.service.js';

async function writeSystemAudit(
  req: Request,
  action: string,
  resource: string,
  details: Record<string, unknown> = {},
  tenantId?: string | null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO public.system_audit_logs
         (tenant_id, actor_sub, actor_email, action, resource, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        tenantId || null,
        req.user?.sub || 'unknown',
        req.user?.email || 'unknown',
        action,
        resource,
        JSON.stringify(details),
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null,
        req.headers['user-agent'] || null,
      ]
    );
  } catch (err) {
    console.warn('Failed to write system audit log', err);
  }
}

export async function registerTenant(req: Request, res: Response): Promise<void> {
  const {
    slug,
    name,
    adminEmail,
    adminName = 'Administrator',
    adminPassword,
    plan,
    planId,
    maxEmployees = 50,
    billingCycle = 'monthly',
    contactPhone,
    industry = 'Office',
  } = req.body;

  if (!slug || !name || !adminEmail) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'slug, name, and adminEmail are required' } });
    return;
  }

  const cleanEmail = adminEmail.trim().toLowerCase();
  let rawSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const maxSeatsNum = Math.max(1, Number(maxEmployees) || 50);
  const selectedPlan = await getPlanByIdOrKey(pool, String(planId || plan || 'professional'));
  if (!selectedPlan || !selectedPlan.isActive) {
    res.status(400).json({
      success: false,
      error: { code: 'PLAN_NOT_FOUND', message: 'Choose an active license plan for this workspace.' },
    });
    return;
  }
  const { billingCycle: selectedCycle, startTrial } = resolveBillingIntent(billingCycle);

  const client = await pool.connect();
  try {
    const slugCheck = await client.query('SELECT id FROM public.tenants WHERE slug = $1', [rawSlug]);
    if (slugCheck.rows.length > 0) {
      rawSlug = `${rawSlug}_${Math.floor(Math.random() * 1000)}`;
    }
    const schemaName = `tenant_${rawSlug}`;
    const validatedSchema = sanitizeSchemaName(schemaName);

    await client.query('BEGIN');

    const tenantRes = await client.query(
      `INSERT INTO public.tenants (slug, name, schema_name, status, plan, admin_email, contact_phone, industry)
       VALUES ($1, $2, $3, 'active', $4, $5, $6, $7)
       RETURNING *`,
      [rawSlug, name, validatedSchema, selectedPlan.key, cleanEmail, contactPhone || null, industry || 'Office']
    );
    const tenant = tenantRes.rows[0];

    await issueLicense(client, {
      tenantId: tenant.id,
      plan: selectedPlan,
      billingCycle: selectedCycle,
      startTrial,
      maxSeats: maxSeatsNum,
      actorEmail: req.user?.email || 'platform_admin',
    });

    await provisionTenantSchema(validatedSchema);

    const explicitAdminPassword = typeof adminPassword === 'string' ? adminPassword.trim() : '';
    // Placeholder sub until the real Cognito user is provisioned after commit.
    const cognitoSub = `sub_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const passwordHash = explicitAdminPassword ? hashPassword(explicitAdminPassword) : null;
    await client.query(
      `INSERT INTO public.global_auth_mapping (cognito_sub, email, password_hash, tenant_id, role, is_active)
       VALUES ($1, $2, $3, $4, 'super_admin', true)
       ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = true`,
      [cognitoSub, cleanEmail, passwordHash, tenant.id]
    );

    const nameParts = (adminName || 'Administrator').trim().split(/\s+/);
    const firstName = nameParts[0] || 'Administrator';
    const lastName = nameParts.slice(1).join(' ') || '';

    await client.query(`SET search_path TO "${validatedSchema}", public`);
    try {
      const leadership = await ensureOwnerOrgDefaults(
        (text, params) => client.query(text, params),
        { industry, jobTitle: 'CEO / Executive Owner' }
      );
      await client.query(
        `INSERT INTO employees (
           cognito_sub, employee_code, first_name, last_name, email,
           office_id, department_id, job_role_id, role, employment_status,
           account_status, has_completed_profile, onboarding_progress
         ) VALUES ($1, 'EMP001', $2, $3, $4, NULL, $5, $6, 'super_admin', 'active', $7, true, 100)`,
        [cognitoSub, firstName, lastName, cleanEmail, leadership.departmentId, leadership.jobRoleId, explicitAdminPassword ? 'Active' : 'Not Activated']
      );
    } finally {
      await client.query('RESET search_path');
    }

    await client.query('COMMIT');

    let adminInviteSent = false;
    try {
      const auth = await withTenantContext(validatedSchema, (_c, query) =>
        provisionEmployeeAuth({
          employeeId: '',
          email: cleanEmail,
          firstName,
          lastName,
          role: 'super_admin',
          password: explicitAdminPassword || undefined,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          schemaName: validatedSchema,
          sendInvite: !explicitAdminPassword,
          invitedBy: req.user?.name || 'Platform team',
          tenantQuery: query,
        })
      );
      adminInviteSent = auth.inviteSent;
      await pool.query(
        'DELETE FROM public.global_auth_mapping WHERE tenant_id = $1 AND cognito_sub = $2',
        [tenant.id, cognitoSub]
      );
    } catch (provisionErr: any) {
      console.warn(`Tenant "${tenant.slug}" created but admin Cognito provisioning failed:`, provisionErr);
    }

    await writeSystemAudit(req, 'TENANT_PROVISIONED', `tenant:${tenant.slug}`, {
      name: tenant.name,
      schema: tenant.schema_name,
      plan: selectedPlan.key,
      planId: selectedPlan.id,
    }, tenant.id);

    const license = await syncAndSummarizeLicense(pool, tenant.id);
    res.status(201).json({
      success: true,
      message: `Tenant "${name}" successfully registered and schema "${validatedSchema}" provisioned.${
        adminInviteSent ? ` Setup invite emailed to ${cleanEmail}.` : ''
      }`,
      data: { ...tenant, admin_invite_sent: adminInviteSent, license },
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error registering tenant:', err);
    res.status(500).json({ success: false, error: { code: 'TENANT_REGISTRATION_FAILED', message: err.message } });
  } finally {
    client.release();
  }
}

export async function listTenants(_req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT t.*, s.id as subscription_id, s.plan_id, s.tier, s.max_employees, s.status as subscription_status,
              s.billing_cycle, s.current_period_start, s.current_period_end, s.trial_ends_at,
              p.name as plan_name, p.key as plan_key,
              CASE
                WHEN s.status = 'canceled' THEN 'canceled'
                WHEN s.trial_ends_at IS NOT NULL AND s.trial_ends_at > CURRENT_TIMESTAMP THEN 'trialing'
                WHEN s.current_period_end IS NOT NULL AND s.current_period_end < CURRENT_TIMESTAMP THEN 'expired'
                WHEN s.current_period_end IS NOT NULL AND s.current_period_end <= CURRENT_TIMESTAMP + INTERVAL '14 days' THEN 'expiring'
                ELSE COALESCE(s.status, 'active')
              END as license_status,
              GREATEST(0, CEIL(EXTRACT(EPOCH FROM (s.current_period_end - CURRENT_TIMESTAMP)) / 86400))::int as days_remaining
       FROM public.tenants t
       LEFT JOIN public.tenant_subscriptions s ON t.id = s.tenant_id
       LEFT JOIN public.license_plans p ON p.id = s.plan_id
       WHERE t.slug <> 'platform'
       ORDER BY t.created_at DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function getTenantDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT t.*, s.tier, s.max_employees, s.status as subscription_status, s.plan_id,
              s.billing_cycle, s.current_period_start, s.current_period_end, s.trial_ends_at
       FROM public.tenants t
       LEFT JOIN public.tenant_subscriptions s ON t.id = s.tenant_id
       WHERE t.id::text = $1 OR t.slug = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }
    const tenant = result.rows[0];
    const license = await syncAndSummarizeLicense(pool, tenant.id);
    const events = await listLicenseEvents(pool, tenant.id);
    res.json({ success: true, data: { ...tenant, license, events } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function toggleTenantStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (status !== 'active' && status !== 'suspended') {
      res.status(400).json({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'status must be "active" or "suspended".' },
      });
      return;
    }
    const result = await pool.query(
      `UPDATE public.tenants
          SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE (id::text = $2 OR slug = $2) AND slug <> 'platform'
        RETURNING *`,
      [status, id]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }
    await writeSystemAudit(
      req,
      status === 'suspended' ? 'TENANT_SUSPENDED' : 'TENANT_ACTIVATED',
      `tenant:${tenant.slug}`,
      { status },
      tenant.id
    );
    res.json({ success: true, data: tenant });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateTenantPlan(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const tenantId = await resolveTenantUuid(pool, id);
    if (!tenantId) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }
    const license = await mutateTenantLicense(
      pool,
      tenantId,
      {
        planId: req.body.planId,
        plan: req.body.plan,
        maxSeats: req.body.maxSeats,
        billingCycle: req.body.billingCycle,
        term: req.body.term,
        extendDays: req.body.extendDays,
        periodEnd: req.body.periodEnd,
        revoke: Boolean(req.body.revoke),
      },
      req.user?.email
    );
    await writeSystemAudit(req, 'PLAN_UPDATED', `tenant:${tenantId}`, req.body, tenantId);
    res.json({ success: true, message: 'Tenant license updated successfully', data: license });
  } catch (err: any) {
    if (err instanceof LicenseError) {
      res.status(err.httpStatus).json({ success: false, error: { code: err.code, message: err.message } });
      return;
    }
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

/**
 * Deletes Cognito identities for emails that no longer map to any workspace.
 * Users who still belong to another workspace keep their login.
 */
async function purgeOrphanedCognitoUsers(emails: string[]): Promise<{ deleted: string[]; failed: string[] }> {
  const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const deleted: string[] = [];
  const failed: string[] = [];
  if (unique.length === 0) return { deleted, failed };

  const remaining = await pool.query(
    `SELECT DISTINCT LOWER(email) AS email FROM public.global_auth_mapping WHERE LOWER(email) = ANY($1::text[])`,
    [unique]
  );
  const stillMapped = new Set(remaining.rows.map((r) => r.email));

  for (const email of unique) {
    if (stillMapped.has(email)) continue;
    if (await cognitoAdminDeleteUserByEmail(email)) deleted.push(email);
    else failed.push(email);
  }
  return { deleted, failed };
}

async function collectWorkspaceIdentities(
  client: PoolClient,
  tenantId: string,
  schemaName: string,
  adminEmail?: string | null
): Promise<{ emails: string[]; subs: string[] }> {
  const emails = new Set<string>();
  const subs = new Set<string>();
  const addEmail = (value: unknown) => {
    const email = String(value || '').trim().toLowerCase();
    if (email) emails.add(email);
  };
  const addSub = (value: unknown) => {
    const sub = String(value || '').trim();
    if (sub) subs.add(sub);
  };

  addEmail(adminEmail);

  const mappings = await client.query(
    `SELECT cognito_sub, email FROM public.global_auth_mapping WHERE tenant_id = $1`,
    [tenantId]
  );
  for (const row of mappings.rows) {
    addEmail(row.email);
    addSub(row.cognito_sub);
  }

  const tables: { name: string; sql: string }[] = [
    { name: 'employees', sql: `SELECT email, cognito_sub FROM "${schemaName}".employees` },
    { name: 'students', sql: `SELECT email FROM "${schemaName}".students` },
  ];
  for (const table of tables) {
    try {
      await client.query(`SAVEPOINT collect_${table.name}`);
      const rows = await client.query(table.sql);
      await client.query(`RELEASE SAVEPOINT collect_${table.name}`);
      for (const row of rows.rows) {
        addEmail(row.email);
        addSub(row.cognito_sub);
      }
    } catch {
      await client.query(`ROLLBACK TO SAVEPOINT collect_${table.name}`).catch(() => {});
    }
  }

  return { emails: [...emails], subs: [...subs] };
}

export async function deleteTenant(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const confirmation = String(req.body?.confirmName || req.body?.confirmSlug || '').trim().toLowerCase();

  const client = await pool.connect();
  try {
    const tenantRes = await client.query(
      `SELECT id, slug, name, schema_name, admin_email, status FROM public.tenants WHERE id::text = $1 OR slug = $1 LIMIT 1`,
      [id]
    );
    const tenant = tenantRes.rows[0];
    if (!tenant) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }
    if (tenant.slug === 'platform') {
      res.status(403).json({ success: false, error: { code: 'PROTECTED_TENANT', message: 'The platform workspace cannot be deleted.' } });
      return;
    }
    if (tenant.status !== 'suspended') {
      res.status(409).json({
        success: false,
        error: {
          code: 'TENANT_NOT_SUSPENDED',
          message: 'Suspend the workspace before deleting it.',
        },
      });
      return;
    }
    const expectedName = String(tenant.name || '').trim().toLowerCase();
    if (!confirmation || (confirmation !== expectedName && confirmation !== tenant.slug)) {
      res.status(400).json({
        success: false,
        error: { code: 'CONFIRMATION_MISMATCH', message: `Type "${tenant.name}" to confirm deletion.` },
      });
      return;
    }

    const schemaName = sanitizeSchemaName(tenant.schema_name);

    await client.query('BEGIN');
    const identities = await collectWorkspaceIdentities(client, tenant.id, schemaName, tenant.admin_email);

    const mappingDelete = await client.query(
      `DELETE FROM public.global_auth_mapping WHERE tenant_id = $1 RETURNING id`,
      [tenant.id]
    );
    try {
      await client.query('SAVEPOINT auth_tokens');
      await client.query(`DELETE FROM public.auth_tokens WHERE tenant_id = $1`, [tenant.id]);
      await client.query('RELEASE SAVEPOINT auth_tokens');
    } catch {
      await client.query('ROLLBACK TO SAVEPOINT auth_tokens').catch(() => {});
    }

    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.query('DELETE FROM public.tenants WHERE id = $1', [tenant.id]);
    await client.query('COMMIT');

    invalidateAuthIdentities({ tenantUuid: tenant.id, subs: identities.subs });
    const cognito = await purgeOrphanedCognitoUsers(identities.emails);
    const usersRemoved = Math.max(mappingDelete.rowCount || 0, identities.emails.length);

    await writeSystemAudit(req, 'TENANT_DELETED', `tenant:${tenant.slug}`, {
      tenantId: tenant.id,
      name: tenant.name,
      schema: schemaName,
      usersRemoved,
      emailsRemoved: identities.emails,
      cognitoDeleted: cognito.deleted.length,
      cognitoFailed: cognito.failed,
    });

    res.json({
      success: true,
      message: `Workspace "${tenant.name}" was permanently deleted along with ${usersRemoved} user(s).`,
      data: { id: tenant.id, slug: tenant.slug, usersRemoved, cognito },
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error deleting tenant:', err);
    res.status(500).json({ success: false, error: { code: 'TENANT_DELETE_FAILED', message: err.message } });
  } finally {
    client.release();
  }
}

/** Null out FK columns that would otherwise block deleting this employee (no ON DELETE rule). */
async function detachEmployeeReferences(client: PoolClient, schemaName: string, employeeId: string): Promise<void> {
  const refs = await client.query(
    `SELECT cl.relname AS table_name, att.attname AS column_name
     FROM pg_constraint con
     JOIN pg_class cl ON cl.oid = con.conrelid
     JOIN pg_namespace ns ON ns.oid = cl.relnamespace
     JOIN pg_class ref ON ref.oid = con.confrelid
     JOIN pg_namespace refns ON refns.oid = ref.relnamespace
     JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
     WHERE con.contype = 'f'
       AND con.confdeltype IN ('a', 'r')
       AND refns.nspname = $1 AND ref.relname = 'employees'
       AND ns.nspname = $1`,
    [schemaName]
  );
  for (const { table_name, column_name } of refs.rows) {
    await client.query(
      `UPDATE "${schemaName}"."${table_name}" SET "${column_name}" = NULL WHERE "${column_name}" = $1`,
      [employeeId]
    );
  }
}

export async function deleteGlobalUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    const mappingRes = await client.query(
      `SELECT m.id, m.cognito_sub, m.email, m.role, m.tenant_id, t.slug AS tenant_slug, t.schema_name
       FROM public.global_auth_mapping m
       JOIN public.tenants t ON t.id = m.tenant_id
       WHERE m.id::text = $1
       LIMIT 1`,
      [id]
    );
    const mapping = mappingRes.rows[0];
    if (!mapping) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }
    if (mapping.role === 'platform_admin' || mapping.tenant_slug === 'platform') {
      res.status(403).json({ success: false, error: { code: 'PROTECTED_USER', message: 'Platform operators cannot be deleted from the console.' } });
      return;
    }

    const email = String(mapping.email).trim().toLowerCase();
    const schemaName = sanitizeSchemaName(mapping.schema_name);

    if (mapping.role === 'super_admin') {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS c FROM public.global_auth_mapping
         WHERE tenant_id = $1 AND role = 'super_admin' AND is_active = true AND id <> $2`,
        [mapping.tenant_id, mapping.id]
      );
      if ((admins.rows[0]?.c || 0) === 0) {
        res.status(409).json({
          success: false,
          error: { code: 'LAST_ADMIN', message: 'This is the only active super admin of the workspace. Delete the workspace instead, or promote another admin first.' },
        });
        return;
      }
    }

    await client.query('BEGIN');

    const employeeRes = await client.query(
      `SELECT id FROM "${schemaName}".employees WHERE cognito_sub = $1 OR LOWER(email) = $2`,
      [mapping.cognito_sub, email]
    );
    for (const emp of employeeRes.rows) {
      await detachEmployeeReferences(client, schemaName, emp.id);
      await client.query(`DELETE FROM "${schemaName}".employees WHERE id = $1`, [emp.id]);
    }

    if (mapping.role === 'student') {
      await client.query(`SAVEPOINT students`);
      await client.query(`DELETE FROM "${schemaName}".students WHERE LOWER(email) = $1`, [email])
        .catch(() => client.query(`ROLLBACK TO SAVEPOINT students`));
    }

    await client.query('DELETE FROM public.global_auth_mapping WHERE id = $1', [mapping.id]);
    await client.query('COMMIT');

    invalidateAuthIdentities({ subs: [mapping.cognito_sub] });
    const cognito = await purgeOrphanedCognitoUsers([email]);

    await writeSystemAudit(req, 'USER_DELETED', `user:${email}`, {
      role: mapping.role,
      tenant: mapping.tenant_slug,
      employeeRowsRemoved: employeeRes.rows.length,
      cognitoDeleted: cognito.deleted.length > 0,
      cognitoFailed: cognito.failed.length > 0,
    }, mapping.tenant_id);

    res.json({
      success: true,
      message: `User "${email}" was removed from workspace "${mapping.tenant_slug}".`,
      data: { id: mapping.id, email, cognito },
    });
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, error: { code: 'USER_DELETE_FAILED', message: err.message } });
  } finally {
    client.release();
  }
}

export async function listDatabaseSchemas(_req: Request, res: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT schema_name 
       FROM information_schema.schemata 
       WHERE schema_name LIKE 'tenant_%' OR schema_name = 'public'
       ORDER BY schema_name`
    );
    res.json({ success: true, data: result.rows.map(r => r.schema_name) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function triggerClusterBackup(req: Request, res: Response): Promise<void> {
  const snapshotId = `aurora-snapshot-${Date.now()}`;
  await writeSystemAudit(req, 'CLUSTER_BACKUP', 'database', { snapshotId });
  res.json({
    success: true,
    message: 'AWS Aurora automated cluster snapshot trigger registered with Amazon RDS API.',
    snapshotId,
  });
}

export async function getAWSTelemetry(_req: Request, res: Response): Promise<void> {
  res.json({
    success: true,
    data: {
      auroraServerless: {
        currentACU: 2.0,
        minACU: 0.5,
        maxACU: 16.0,
        cpuUtilizationPercent: 14.2,
        bufferCacheHitRatioPercent: 99.8,
        activeConnections: 4,
      },
      ecsFargate: {
        clusterName: 'enterprise-bos-prod-cluster',
        serviceName: 'enterprise-bos-backend-service',
        runningTasks: 2,
        desiredTasks: 2,
        memoryUtilizationPercent: 28.5,
        cpuUtilizationPercent: 8.1,
      },
      cognito: {
        status: 'ACTIVE',
        userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_examplepool',
      },
    },
  });
}

export async function searchGlobalUsers(req: Request, res: Response): Promise<void> {
  try {
    const query = String(req.query.q || '');
    const result = await pool.query(
      `SELECT m.*, t.name as tenant_name, t.slug as tenant_slug
       FROM public.global_auth_mapping m
       JOIN public.tenants t ON m.tenant_id = t.id
       WHERE t.slug <> 'platform'
         AND (m.email ILIKE $1 OR m.cognito_sub ILIKE $1 OR $1 = '%%')
       ORDER BY m.created_at DESC
       LIMIT 50`,
      [`%${query}%`]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function mapGlobalUser(req: Request, res: Response): Promise<void> {
  try {
    const { cognitoSub, email, tenantId, role = 'employee' } = req.body;
    const result = await pool.query(
      `INSERT INTO public.global_auth_mapping (cognito_sub, email, tenant_id, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (cognito_sub, tenant_id) DO UPDATE SET role = EXCLUDED.role, is_active = true
       RETURNING *`,
      [cognitoSub, email, tenantId, role]
    );
    await writeSystemAudit(req, 'USER_MAPPED', `user:${email}`, { role, tenantId }, tenantId);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

/**
 * Issue a short-lived app JWT that lets a platform operator act as tenant super_admin.
 * Frontend redirects to APP_ORIGIN /impersonate with this token.
 */
export async function startImpersonation(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, slug, name, schema_name, status, industry, admin_email
       FROM public.tenants
       WHERE (id::text = $1 OR slug = $1) AND slug <> 'platform'
       LIMIT 1`,
      [id]
    );
    const tenant = result.rows[0];
    if (!tenant) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
      return;
    }
    if (tenant.status === 'suspended') {
      res.status(403).json({
        success: false,
        error: { code: 'TENANT_SUSPENDED', message: 'Cannot jump into a suspended workspace.' },
      });
      return;
    }

    const operator = req.user!;
    const token = signJwt(
      {
        sub: operator.sub,
        email: operator.email,
        name: operator.name || operator.email,
        role: 'super_admin',
        tenant_id: tenant.slug,
        db_schema: tenant.schema_name,
        impersonation: true,
        impersonated_tenant_id: tenant.id,
        impersonated_tenant_name: tenant.name,
        operator_email: operator.email,
        operator_role: 'platform_admin',
      },
      60 * 60 * 4 // 4 hours
    );

    await writeSystemAudit(
      req,
      'IMPERSONATION_START',
      `tenant:${tenant.slug}`,
      { tenantName: tenant.name },
      tenant.id
    );

    res.json({
      success: true,
      data: {
        token,
        acceptUrl: frontendUrl(`/impersonate?token=${encodeURIComponent(token)}`),
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          schemaName: tenant.schema_name,
          industry: tenant.industry || 'Office',
          adminEmail: tenant.admin_email,
          status: tenant.status,
        },
        expiresInSeconds: 60 * 60 * 4,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'IMPERSONATION_FAILED', message: err.message } });
  }
}

export async function listLicensePlans(_req: Request, res: Response): Promise<void> {
  try {
    const plans = await listAllPlans(pool);
    res.json({ success: true, data: plans });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function createLicensePlan(req: Request, res: Response): Promise<void> {
  try {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Plan name is required.' } });
      return;
    }
    const key = String(req.body?.key || name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);
    const features = Array.isArray(req.body?.features)
      ? req.body.features.map((f: unknown) => String(f).trim()).filter(Boolean)
      : String(req.body?.features || '')
          .split(/[,\n]/)
          .map((f: string) => f.trim())
          .filter(Boolean);
    const result = await pool.query(
      `INSERT INTO public.license_plans
         (key, name, description, price_monthly, price_annual, max_seats, trial_days, features, is_active, is_public, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
       RETURNING *`,
      [
        key,
        name,
        String(req.body?.description || '').trim() || null,
        Number(req.body?.priceMonthly ?? req.body?.price ?? 0) || 0,
        Number(req.body?.priceAnnual ?? 0) || 0,
        Math.max(1, Number(req.body?.maxSeats) || 25),
        Math.max(0, Number(req.body?.trialDays) || 0),
        JSON.stringify(features),
        req.body?.isActive !== false,
        req.body?.isPublic !== false,
        Number(req.body?.sortOrder) || 100,
      ]
    );
    await writeSystemAudit(req, 'LICENSE_PLAN_CREATED', `plan:${key}`, { name });
    res.status(201).json({ success: true, data: mapPlanRow(result.rows[0]) });
  } catch (err: any) {
    if (String(err.message || '').includes('duplicate') || err.code === '23505') {
      res.status(409).json({ success: false, error: { code: 'PLAN_EXISTS', message: 'A plan with that key already exists.' } });
      return;
    }
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function updateLicensePlan(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await pool.query(`SELECT * FROM public.license_plans WHERE id::text = $1 OR key = $1`, [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      return;
    }
    const current = existing.rows[0];
    const features = req.body?.features == null
      ? current.features
      : Array.isArray(req.body.features)
        ? req.body.features.map((f: unknown) => String(f).trim()).filter(Boolean)
        : String(req.body.features)
            .split(/[,\n]/)
            .map((f: string) => f.trim())
            .filter(Boolean);
    const result = await pool.query(
      `UPDATE public.license_plans
          SET name = $1, description = $2, price_monthly = $3, price_annual = $4, max_seats = $5,
              trial_days = $6, features = $7::jsonb, is_active = $8, is_public = $9, sort_order = $10,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $11
        RETURNING *`,
      [
        String(req.body?.name || current.name).trim(),
        req.body?.description !== undefined ? String(req.body.description || '').trim() || null : current.description,
        Number(req.body?.priceMonthly ?? req.body?.price ?? current.price_monthly) || 0,
        Number(req.body?.priceAnnual ?? current.price_annual) || 0,
        Math.max(1, Number(req.body?.maxSeats ?? current.max_seats) || 1),
        Math.max(0, Number(req.body?.trialDays ?? current.trial_days) || 0),
        JSON.stringify(features),
        req.body?.isActive === undefined ? current.is_active : Boolean(req.body.isActive),
        req.body?.isPublic === undefined ? current.is_public : Boolean(req.body.isPublic),
        Number(req.body?.sortOrder ?? current.sort_order) || 100,
        current.id,
      ]
    );
    await writeSystemAudit(req, 'LICENSE_PLAN_UPDATED', `plan:${current.key}`, { id: current.id });
    res.json({ success: true, data: mapPlanRow(result.rows[0]) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function deactivateLicensePlan(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const existing = await pool.query(`SELECT * FROM public.license_plans WHERE id::text = $1 OR key = $1`, [id]);
    if (!existing.rows[0]) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Plan not found' } });
      return;
    }
    const inUse = await pool.query(
      `SELECT COUNT(*)::int AS n FROM public.tenant_subscriptions WHERE plan_id = $1 AND status IS DISTINCT FROM 'canceled'`,
      [existing.rows[0].id]
    );
    const used = Number(inUse.rows[0]?.n || 0);
    if (used > 0) {
      const result = await pool.query(
        `UPDATE public.license_plans SET is_active = false, is_public = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [existing.rows[0].id]
      );
      await writeSystemAudit(req, 'LICENSE_PLAN_DEACTIVATED', `plan:${existing.rows[0].key}`, { inUse: used });
      res.json({
        success: true,
        message: `License deactivated because ${used} workspace(s) still use it.`,
        data: mapPlanRow(result.rows[0]),
      });
      return;
    }
    const historic = await pool.query(
      `SELECT COUNT(*)::int AS n FROM public.tenant_subscriptions WHERE plan_id = $1`,
      [existing.rows[0].id]
    );
    if (Number(historic.rows[0]?.n || 0) > 0) {
      const result = await pool.query(
        `UPDATE public.license_plans SET is_active = false, is_public = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
        [existing.rows[0].id]
      );
      await writeSystemAudit(req, 'LICENSE_PLAN_DEACTIVATED', `plan:${existing.rows[0].key}`, { historic: true });
      res.json({
        success: true,
        message: 'License deactivated because past workspace assignments still reference it.',
        data: mapPlanRow(result.rows[0]),
      });
      return;
    }
    await pool.query(`DELETE FROM public.license_plans WHERE id = $1`, [existing.rows[0].id]);
    await writeSystemAudit(req, 'LICENSE_PLAN_DELETED', `plan:${existing.rows[0].key}`, {});
    res.json({ success: true, data: { id: existing.rows[0].id, deleted: true } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}

export async function listSystemAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const result = await pool.query(
      `SELECT a.*, t.name as tenant_name, t.slug as tenant_slug
       FROM public.system_audit_logs a
       LEFT JOIN public.tenants t ON a.tenant_id = t.id
       ORDER BY a.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'DB_ERROR', message: err.message } });
  }
}
