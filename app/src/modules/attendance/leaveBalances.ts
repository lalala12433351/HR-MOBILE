import { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { withTenantContext } from '../../db/queryRunner.js';

export type BalanceLeaveType = 'casual' | 'sick' | 'earned' | 'wfh';
export type BalanceTxReason = 'accrual_init' | 'approve' | 'cancel_credit' | 'manual_adjust' | 'carry_over';

type QueryFn = <R extends QueryResultRow = any>(text: string, params?: any[]) => Promise<QueryResult<R>>;

const COLUMN_BY_TYPE: Record<BalanceLeaveType, string> = {
  casual: 'casual_leave',
  sick: 'sick_leave',
  earned: 'earned_leave',
  wfh: 'wfh',
};

export function isDebitableLeaveType(leaveType: string): leaveType is BalanceLeaveType {
  return ['casual', 'sick', 'earned', 'wfh'].includes(String(leaveType).toLowerCase());
}

function currentYear(year?: number): number {
  return year && Number.isFinite(year) ? Math.trunc(year) : new Date().getFullYear();
}

async function loadLeaveSettings(query: QueryFn): Promise<any> {
  const res = await query(
    `SELECT value FROM tenant_settings WHERE key = 'attendance' LIMIT 1`
  );
  const attendance = res.rows[0]?.value || {};
  return attendance.leaveSettings || attendance.leave_settings || {};
}

function roleQuotaKey(role?: string): string {
  const r = String(role || '').toLowerCase();
  if (r === 'super_admin' || r === 'admin') return 'admin';
  if (r === 'hr_manager' || r === 'hr') return 'hr_manager';
  if (r === 'team_lead') return 'team_lead';
  if (r.includes('manager')) return 'manager';
  if (r.includes('contract')) return 'contractor';
  if (r.includes('intern')) return 'intern';
  return 'employee';
}

function quotasFromSettings(leaveSettings: any, role?: string) {
  const roleKey = roleQuotaKey(role);
  const roleQuotas = leaveSettings?.roleLeaveQuotas?.[roleKey] || leaveSettings?.roleLeaveQuotas?.employee || {};
  return {
    casual: Number(roleQuotas.casualLeave ?? leaveSettings?.casualLeaveQuota ?? 12) || 12,
    sick: Number(roleQuotas.sickLeave ?? leaveSettings?.sickLeaveQuota ?? 10) || 10,
    earned: Number(roleQuotas.earnedLeave ?? leaveSettings?.paidLeaveQuota ?? 15) || 15,
    wfh: Number(roleQuotas.compOff ?? leaveSettings?.wfhQuota ?? 24) || 24,
  };
}

async function insertTx(
  query: QueryFn,
  args: {
    employeeId: string;
    year: number;
    leaveType: BalanceLeaveType;
    delta: number;
    reason: BalanceTxReason;
    leaveRequestId?: string | null;
    actorId?: string | null;
    notes?: string | null;
  }
) {
  await query(
    `INSERT INTO leave_balance_transactions
       (employee_id, year, leave_type, delta, reason, leave_request_id, actor_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      args.employeeId,
      args.year,
      args.leaveType,
      args.delta,
      args.reason,
      args.leaveRequestId || null,
      args.actorId || null,
      args.notes || null,
    ]
  );
}

/** Ensure a balance row exists for employee/year; seed from leaveSettings if missing. */
export async function ensureLeaveBalance(
  query: QueryFn,
  employeeId: string,
  year?: number,
  actorId?: string | null
): Promise<any> {
  const rows = await ensureLeaveBalancesBatch(query, [employeeId], year, actorId);
  const row = rows[0];
  if (!row) throw new Error('Employee not found for leave balance init');
  return row;
}

/**
 * Batch-load leave balances for many employees in a few queries instead of
 * per-employee round trips (avoids N+1 that saturates the RDS pool).
 */
export async function ensureLeaveBalancesBatch(
  query: QueryFn,
  employeeIds: string[],
  year?: number,
  actorId?: string | null
): Promise<any[]> {
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const y = currentYear(year);
  const existing = await query(
    `SELECT * FROM employee_leave_balances
     WHERE year = $1 AND employee_id = ANY($2::uuid[])`,
    [y, uniqueIds]
  );
  const byEmployee = new Map<string, any>(
    existing.rows.map((row: any) => [String(row.employee_id), row])
  );
  const missingIds = uniqueIds.filter((id) => !byEmployee.has(id));

  if (missingIds.length > 0) {
    const leaveSettings = await loadLeaveSettings(query);
    const empRes = await query(
      `SELECT id, role FROM employees WHERE id = ANY($1::uuid[])`,
      [missingIds]
    );

    const seedRows: Array<{
      employeeId: string;
      casual: number;
      sick: number;
      earned: number;
      wfh: number;
    }> = [];

    for (const emp of empRes.rows) {
      const q = quotasFromSettings(leaveSettings, emp.role);
      seedRows.push({
        employeeId: String(emp.id),
        casual: q.casual,
        sick: q.sick,
        earned: q.earned,
        wfh: q.wfh,
      });
    }

    if (seedRows.length > 0) {
      const values: any[] = [];
      const placeholders: string[] = [];
      seedRows.forEach((row, idx) => {
        const base = idx * 6;
        placeholders.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`
        );
        values.push(row.employeeId, y, row.casual, row.sick, row.earned, row.wfh);
      });

      const inserted = await query(
        `INSERT INTO employee_leave_balances
           (employee_id, year, casual_leave, sick_leave, earned_leave, wfh)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (employee_id, year) DO NOTHING
         RETURNING *`,
        values
      );

      if (inserted.rows.length > 0) {
        const txValues: any[] = [];
        const txPlaceholders: string[] = [];
        let txIdx = 0;
        for (const bal of inserted.rows) {
          const seed = seedRows.find((s) => s.employeeId === String(bal.employee_id));
          if (!seed) continue;
          for (const [leaveType, delta] of [
            ['casual', seed.casual],
            ['sick', seed.sick],
            ['earned', seed.earned],
            ['wfh', seed.wfh],
          ] as const) {
            if (delta === 0) continue;
            const base = txIdx * 8;
            txPlaceholders.push(
              `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`
            );
            txValues.push(
              bal.employee_id,
              y,
              leaveType,
              delta,
              'accrual_init',
              null,
              actorId || null,
              'Initial year balance from leaveSettings'
            );
            txIdx += 1;
          }
        }
        if (txPlaceholders.length > 0) {
          await query(
            `INSERT INTO leave_balance_transactions
               (employee_id, year, leave_type, delta, reason, leave_request_id, actor_id, notes)
             VALUES ${txPlaceholders.join(', ')}`,
            txValues
          );
        }
      }

      // Re-read so concurrent inserts / DO NOTHING races are included
      const refreshed = await query(
        `SELECT * FROM employee_leave_balances
         WHERE year = $1 AND employee_id = ANY($2::uuid[])`,
        [y, uniqueIds]
      );
      byEmployee.clear();
      for (const row of refreshed.rows) {
        byEmployee.set(String(row.employee_id), row);
      }
    }
  }

  return uniqueIds.map((id) => byEmployee.get(id)).filter(Boolean);
}

export async function getPendingDaysByType(
  query: QueryFn,
  employeeId: string,
  leaveType: BalanceLeaveType,
  year?: number
): Promise<number> {
  const y = currentYear(year);
  const res = await query(
    `SELECT COALESCE(SUM(days_count), 0)::float AS pending_days
     FROM leave_requests
     WHERE employee_id = $1
       AND leave_type = $2
       AND status = 'pending'
       AND EXTRACT(YEAR FROM start_date) = $3`,
    [employeeId, leaveType, y]
  );
  return Number(res.rows[0]?.pending_days || 0);
}

export async function assertSufficientBalance(
  query: QueryFn,
  employeeId: string,
  leaveType: string,
  daysCount: number,
  year?: number
): Promise<void> {
  if (!isDebitableLeaveType(leaveType)) return;
  const y = currentYear(year);
  const bal = await ensureLeaveBalance(query, employeeId, y);
  const col = COLUMN_BY_TYPE[leaveType];
  const remaining = Number(bal[col] || 0);
  const pending = await getPendingDaysByType(query, employeeId, leaveType, y);
  if (remaining - pending < daysCount - 1e-9) {
    throw Object.assign(new Error(`Insufficient ${leaveType} leave balance`), {
      code: 'INSUFFICIENT_BALANCE',
      remaining,
      pending,
      requested: daysCount,
    });
  }
}

async function applyDelta(
  query: QueryFn,
  args: {
    employeeId: string;
    leaveType: BalanceLeaveType;
    delta: number;
    reason: BalanceTxReason;
    year?: number;
    leaveRequestId?: string | null;
    actorId?: string | null;
    notes?: string | null;
    allowNegative?: boolean;
  }
): Promise<any> {
  const y = currentYear(args.year);
  await ensureLeaveBalance(query, args.employeeId, y, args.actorId);
  const col = COLUMN_BY_TYPE[args.leaveType];

  const locked = await query(
    `SELECT * FROM employee_leave_balances WHERE employee_id = $1 AND year = $2 FOR UPDATE`,
    [args.employeeId, y]
  );
  const row = locked.rows[0];
  if (!row) throw new Error('Leave balance row missing after ensure');

  const current = Number(row[col] || 0);
  const next = current + args.delta;
  if (!args.allowNegative && next < -1e-9) {
    throw Object.assign(new Error(`Insufficient ${args.leaveType} leave balance`), {
      code: 'INSUFFICIENT_BALANCE',
      remaining: current,
      requested: Math.abs(args.delta),
    });
  }

  const updated = await query(
    `UPDATE employee_leave_balances
     SET ${col} = $1, updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $2 AND year = $3
     RETURNING *`,
    [Math.max(0, Math.round(next * 2) / 2), args.employeeId, y]
  );

  await insertTx(query, {
    employeeId: args.employeeId,
    year: y,
    leaveType: args.leaveType,
    delta: args.delta,
    reason: args.reason,
    leaveRequestId: args.leaveRequestId,
    actorId: args.actorId,
    notes: args.notes,
  });

  return updated.rows[0];
}

export async function debitLeaveBalance(
  query: QueryFn,
  args: {
    employeeId: string;
    leaveType: string;
    daysCount: number;
    leaveRequestId: string;
    actorId?: string | null;
    year?: number;
  }
): Promise<any | null> {
  if (!isDebitableLeaveType(args.leaveType)) return null;
  return applyDelta(query, {
    employeeId: args.employeeId,
    leaveType: args.leaveType,
    delta: -Math.abs(Number(args.daysCount) || 0),
    reason: 'approve',
    year: args.year,
    leaveRequestId: args.leaveRequestId,
    actorId: args.actorId,
    notes: 'Debit on leave approval',
  });
}

export async function creditLeaveBalance(
  query: QueryFn,
  args: {
    employeeId: string;
    leaveType: string;
    daysCount: number;
    leaveRequestId: string;
    actorId?: string | null;
    year?: number;
  }
): Promise<any | null> {
  if (!isDebitableLeaveType(args.leaveType)) return null;
  return applyDelta(query, {
    employeeId: args.employeeId,
    leaveType: args.leaveType,
    delta: Math.abs(Number(args.daysCount) || 0),
    reason: 'cancel_credit',
    year: args.year,
    leaveRequestId: args.leaveRequestId,
    actorId: args.actorId,
    notes: 'Credit on cancel of approved leave',
    allowNegative: false,
  });
}

export async function adjustLeaveBalance(
  query: QueryFn,
  args: {
    employeeId: string;
    leaveType: BalanceLeaveType;
    delta: number;
    notes?: string;
    actorId?: string | null;
    year?: number;
  }
): Promise<any> {
  return applyDelta(query, {
    employeeId: args.employeeId,
    leaveType: args.leaveType,
    delta: Number(args.delta) || 0,
    reason: 'manual_adjust',
    year: args.year,
    actorId: args.actorId,
    notes: args.notes || 'Manual HR adjustment',
    allowNegative: true,
  });
}

export function serializeBalance(row: any) {
  if (!row) return null;
  return {
    employeeId: row.employee_id,
    year: row.year,
    casualLeave: Number(row.casual_leave || 0),
    sickLeave: Number(row.sick_leave || 0),
    earnedLeave: Number(row.earned_leave || 0),
    wfh: Number(row.wfh || 0),
    updatedAt: row.updated_at,
  };
}

/** Run a callback inside a single tenant connection with BEGIN/COMMIT. */
export async function withTenantTransaction<T>(
  schemaName: string,
  fn: (query: QueryFn, client: PoolClient) => Promise<T>
): Promise<T> {
  return withTenantContext(schemaName, async (client, query) => {
    await client.query('BEGIN');
    try {
      const result = await fn(query, client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw err;
    }
  });
}
