import { Request } from 'express';
import { provisionEmployeeAuth } from '../identity/provisionEmployeeAuth.js';
import { withTenantContext } from '../../db/queryRunner.js';
import { log } from '../../utils/logger.js';

type TenantQuery = NonNullable<Request['tenantQuery']>;

export type RepairMeta = {
  actorEmail?: string;
  tenantId?: string;
  tenantSlug?: string;
  schemaName?: string;
};

/** Highest numeric EMP/SETUP sequence currently used (EMP001 and EMP-001 both count as 1). */
export async function getMaxEmployeeSequence(query: TenantQuery): Promise<number> {
  const res = await query(`SELECT employee_code FROM employees WHERE employee_code IS NOT NULL`);
  let max = 0;
  for (const row of res.rows) {
    const code = String(row.employee_code || '');
    const match = code.match(/^(?:EMP|SETUP)-?0*(\d+)$/i);
    if (match) {
      max = Math.max(max, parseInt(match[1], 10));
    }
  }
  return max;
}

/** Allocate the next EMP-001 style codes (settings format: Prefix-Sequence). */
export async function allocateEmployeeCodes(query: TenantQuery, count: number): Promise<string[]> {
  if (count <= 0) return [];
  let max = await getMaxEmployeeSequence(query);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    max += 1;
    codes.push(`EMP-${String(max).padStart(3, '0')}`);
  }
  return codes;
}

export async function allocateOneEmployeeCode(query: TenantQuery): Promise<string> {
  const [code] = await allocateEmployeeCodes(query, 1);
  return code;
}

async function runRepair(
  query: TenantQuery,
  meta: RepairMeta
): Promise<{ renumbered: number; provisioned: number }> {
  const actorEmail = (meta.actorEmail || '').trim().toLowerCase();
  let renumbered = 0;
  let provisioned = 0;

  const setupCoded = await query(
    `SELECT id, employee_code FROM employees
     WHERE employee_code ILIKE 'SETUP-%'
     ORDER BY created_at ASC NULLS LAST, employee_code ASC`
  );

  if (setupCoded.rows.length > 0) {
    const codes = await allocateEmployeeCodes(query, setupCoded.rows.length);
    for (let i = 0; i < setupCoded.rows.length; i++) {
      const row = setupCoded.rows[i];
      const nextCode = codes[i];
      await query(
        `UPDATE employees SET employee_code = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [nextCode, row.id]
      );
      renumbered += 1;
      log.info(`Renumbered ${row.employee_code} → ${nextCode}`);
    }
  }

  const needsAuth = await query(
    `SELECT id, email, first_name, last_name, role, cognito_sub
     FROM employees
     WHERE role IS DISTINCT FROM 'super_admin'
       AND email IS NOT NULL
       AND TRIM(email) <> ''
       AND (
         cognito_sub IS NULL
         OR cognito_sub = ''
         OR cognito_sub LIKE 'sub_dev_%'
         OR cognito_sub LIKE 'user_%'
       )
     ORDER BY created_at ASC NULLS LAST`
  );

  for (const emp of needsAuth.rows) {
    const email = String(emp.email || '').trim().toLowerCase();
    if (!email || (actorEmail && email === actorEmail)) continue;
    try {
      await provisionEmployeeAuth({
        employeeId: emp.id,
        email,
        firstName: emp.first_name,
        lastName: emp.last_name,
        role: emp.role || 'employee',
        tenantId: meta.tenantId,
        tenantSlug: meta.tenantSlug,
        schemaName: meta.schemaName,
        tenantQuery: query,
      });
      provisioned += 1;
    } catch (err: any) {
      log.warn(`Repair Cognito provisioning failed for ${email}`, err);
    }
  }

  return { renumbered, provisioned };
}

/**
 * Rewrite legacy SETUP-* codes to EMP-### and provision Cognito for anyone
 * missing a real Cognito identity so setup-created users can log in.
 * Uses the request-scoped tenantQuery (safe when awaited before response ends).
 */
export async function repairSetupEmployees(req: Request): Promise<{
  renumbered: number;
  provisioned: number;
}> {
  return runRepair(req.tenantQuery!, {
    actorEmail: ((req as any).user?.email || '').trim().toLowerCase(),
    tenantId: req.tenant?.id,
    tenantSlug: req.tenant?.slug,
    schemaName: req.dbSchema || req.tenant?.schema,
  });
}

/** Own connection — safe for fire-and-forget after the HTTP response is sent. */
export async function repairSetupEmployeesInSchema(
  schemaName: string,
  meta: RepairMeta = {}
): Promise<{ renumbered: number; provisioned: number }> {
  return withTenantContext(schemaName, async (_client, query) => {
    return runRepair(query, { ...meta, schemaName: meta.schemaName || schemaName });
  });
}

const repairInFlight = new Map<string, Promise<void>>();

/**
 * Schedule at-most-one background repair per tenant schema.
 * Does not block the caller; uses an independent DB connection.
 */
export function scheduleRepairSetupEmployees(req: Request): void {
  const schemaName = req.dbSchema || req.tenant?.schema;
  if (!schemaName || repairInFlight.has(schemaName)) return;

  const meta: RepairMeta = {
    actorEmail: ((req as any).user?.email || '').trim().toLowerCase(),
    tenantId: req.tenant?.id,
    tenantSlug: req.tenant?.slug,
    schemaName,
  };

  const job = repairSetupEmployeesInSchema(schemaName, meta)
    .then((result) => {
      if (result.renumbered || result.provisioned) {
        log.info(`Background employee repair finished for ${schemaName}`, result);
      }
    })
    .catch((err) => {
      log.warn(`Background employee repair failed for ${schemaName}`, err);
    })
    .finally(() => {
      repairInFlight.delete(schemaName);
    });

  repairInFlight.set(schemaName, job);
}
