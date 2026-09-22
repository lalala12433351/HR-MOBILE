/**
 * Helpers for employee ↔ office many-to-many assignments.
 * Primary office is mirrored on employees.office_id for backward compatibility.
 */

type TenantQuery = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

export type EmployeeOfficeRow = {
  id: string;
  name: string;
  isPrimary: boolean;
};

export async function ensureEmployeeOfficesTable(tenantQuery: TenantQuery): Promise<void> {
  await tenantQuery(`
    CREATE TABLE IF NOT EXISTS employee_offices (
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (employee_id, office_id)
    );
    CREATE INDEX IF NOT EXISTS idx_employee_offices_office ON employee_offices(office_id);
  `);
}

export async function fetchEmployeeOfficesMap(
  tenantQuery: TenantQuery,
  employeeIds: string[]
): Promise<Map<string, EmployeeOfficeRow[]>> {
  const map = new Map<string, EmployeeOfficeRow[]>();
  if (employeeIds.length === 0) return map;

  try {
    await ensureEmployeeOfficesTable(tenantQuery);
    const result = await tenantQuery(
      `SELECT eo.employee_id, o.id, o.name, eo.is_primary
       FROM employee_offices eo
       JOIN offices o ON o.id = eo.office_id
       WHERE eo.employee_id = ANY($1::uuid[])
       ORDER BY eo.is_primary DESC, o.name ASC`,
      [employeeIds]
    );
    for (const row of result.rows) {
      const empId = String(row.employee_id);
      const list = map.get(empId) || [];
      list.push({
        id: String(row.id),
        name: String(row.name || ''),
        isPrimary: Boolean(row.is_primary),
      });
      map.set(empId, list);
    }
  } catch {
    // Table may not exist yet on very old tenants mid-migration
  }

  return map;
}

export async function fetchOfficesForEmployee(
  tenantQuery: TenantQuery,
  employeeId: string
): Promise<EmployeeOfficeRow[]> {
  const map = await fetchEmployeeOfficesMap(tenantQuery, [employeeId]);
  return map.get(String(employeeId)) || [];
}

/**
 * Replace employee office assignments. Sets employees.office_id to primary.
 * Returns the resolved primary office id (or null).
 */
export async function syncEmployeeOffices(
  tenantQuery: TenantQuery,
  employeeId: string,
  officeIds: string[],
  primaryOfficeId?: string | null
): Promise<string | null> {
  await ensureEmployeeOfficesTable(tenantQuery);

  const uniqueIds = Array.from(
    new Set(
      (officeIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => id && !id.startsWith('00000000'))
    )
  );

  if (uniqueIds.length === 0) {
    await tenantQuery(`DELETE FROM employee_offices WHERE employee_id = $1`, [employeeId]);
    await tenantQuery(`UPDATE employees SET office_id = NULL, updated_at = NOW() WHERE id = $1`, [employeeId]);
    return null;
  }

  // Validate offices exist
  const validRes = await tenantQuery(
    `SELECT id FROM offices WHERE id = ANY($1::uuid[]) AND is_active = true`,
    [uniqueIds]
  );
  const validIds = validRes.rows.map((r: any) => String(r.id));
  if (validIds.length === 0) {
    await tenantQuery(`DELETE FROM employee_offices WHERE employee_id = $1`, [employeeId]);
    await tenantQuery(`UPDATE employees SET office_id = NULL, updated_at = NOW() WHERE id = $1`, [employeeId]);
    return null;
  }

  let primary =
    primaryOfficeId && validIds.includes(String(primaryOfficeId))
      ? String(primaryOfficeId)
      : validIds[0];

  await tenantQuery(`DELETE FROM employee_offices WHERE employee_id = $1`, [employeeId]);

  for (const oid of validIds) {
    await tenantQuery(
      `INSERT INTO employee_offices (employee_id, office_id, is_primary)
       VALUES ($1, $2, $3)
       ON CONFLICT (employee_id, office_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [employeeId, oid, oid === primary]
    );
  }

  await tenantQuery(`UPDATE employees SET office_id = $1, updated_at = NOW() WHERE id = $2`, [
    primary,
    employeeId,
  ]);

  return primary;
}

/**
 * Resolve office IDs from mixed payload (officeIds[], officeId, officeName).
 */
export async function resolveOfficeIdsFromPayload(
  tenantQuery: TenantQuery,
  opts: {
    officeIds?: unknown;
    officeId?: unknown;
    officeName?: unknown;
    location?: unknown;
  }
): Promise<{ officeIds: string[]; primaryOfficeId: string | null }> {
  const ids: string[] = [];

  if (Array.isArray(opts.officeIds)) {
    for (const raw of opts.officeIds) {
      const id = String(raw || '').trim();
      if (id && !id.startsWith('00000000')) ids.push(id);
    }
  }

  const singleId = opts.officeId != null ? String(opts.officeId).trim() : '';
  if (singleId && !singleId.startsWith('00000000') && !ids.includes(singleId)) {
    ids.push(singleId);
  }

  const offNameVal = (opts.officeName || opts.location) as string | undefined;
  if (offNameVal && typeof offNameVal === 'string' && offNameVal.trim()) {
    const name = offNameVal.trim();
    // Support comma-separated names for multi-assign without IDs
    const names = name.includes(',')
      ? name.split(',').map((n) => n.trim()).filter(Boolean)
      : [name];

    for (const n of names) {
      const offCheck = await tenantQuery('SELECT id FROM offices WHERE name ILIKE $1 LIMIT 1', [n]);
      if (offCheck.rows[0]) {
        const oid = String(offCheck.rows[0].id);
        if (!ids.includes(oid)) ids.push(oid);
      } else if (names.length === 1) {
        // Auto-create only for a single unknown name (legacy behavior)
        const code = n.slice(0, 4).toUpperCase() + Math.floor(10 + Math.random() * 90);
        const newOff = await tenantQuery(
          'INSERT INTO offices (name, code, address, latitude, longitude) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [n, code, n, 12.9279, 77.6271]
        );
        ids.push(String(newOff.rows[0].id));
      }
    }
  }

  const primaryOfficeId = ids[0] || null;
  return { officeIds: ids, primaryOfficeId };
}

export function attachOfficesToEmployeeRow(
  row: any,
  offices: EmployeeOfficeRow[]
): any {
  const primary = offices.find((o) => o.isPrimary) || offices[0];
  return {
    ...row,
    offices,
    office_ids: offices.map((o) => o.id),
    office_id: primary?.id || row.office_id || null,
    office_name: primary?.name || row.office_name || null,
  };
}
