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

function roundHalf(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 2) / 2;
}

function monthsElapsedThisYear(joinDate?: string | Date | null, at = new Date()): number {
  const currentYear = at.getFullYear();
  const currentMonthIdx = at.getMonth() + 1;
  if (!joinDate) return currentMonthIdx;
  const join = new Date(joinDate);
  if (Number.isNaN(join.getTime())) return currentMonthIdx;
  const joinYear = join.getFullYear();
  const joinMonth = join.getMonth() + 1;
  if (joinYear === currentYear) return Math.max(1, Math.min(12, currentMonthIdx - joinMonth + 1));
  if (joinYear > currentYear) return 0;
  return currentMonthIdx;
}

function isMonthlyGrant(leaveSettings: any): boolean {
  return leaveSettings?.leavePoliciesEnabled !== false && leaveSettings?.accrualFrequency === 'monthly';
}

function monthlyRolloverEnabled(leaveSettings: any): boolean {
  return leaveSettings?.enableMonthlyRollover !== false;
}

/** Days granted so far this cycle for one leave type (before usage). */
function grantForType(annual: number, leaveSettings: any, monthsElapsed: number): number {
  const yearly = roundHalf(annual);
  if (!isMonthlyGrant(leaveSettings)) return yearly;
  if (!monthlyRolloverEnabled(leaveSettings)) return roundHalf(annual / 12);
  return roundHalf(Math.min(yearly, (annual / 12) * monthsElapsed));
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
      `SELECT id, role, date_of_joining FROM employees WHERE id = ANY($1::uuid[])`,
      [missingIds]
    );
    const enableCarryOver = leaveSettings?.leavePoliciesEnabled !== false && leaveSettings?.enableCarryOver !== false;
    const maxCarry = Math.max(0, Number(leaveSettings?.maxCarryForwardDays) || 10);
    const prevByEmp = new Map<string, any>();
    if (enableCarryOver) {
      const prev = await query(
        `SELECT * FROM employee_leave_balances
         WHERE year = $1 AND employee_id = ANY($2::uuid[])`,
        [y - 1, missingIds]
      );
      for (const row of prev.rows) prevByEmp.set(String(row.employee_id), row);
    }

    const seedRows: Array<{
      employeeId: string;
      casual: number;
      sick: number;
      earned: number;
      wfh: number;
    }> = [];

    for (const emp of empRes.rows) {
      const q = quotasFromSettings(leaveSettings, emp.role);
      let casual = q.casual;
      let sick = q.sick;
      let earned = q.earned;
      const wfh = q.wfh;
      const prev = prevByEmp.get(String(emp.id));
      if (prev && enableCarryOver) {
        casual += Math.min(maxCarry, Math.max(0, Number(prev.casual_leave) || 0));
        sick += Math.min(maxCarry, Math.max(0, Number(prev.sick_leave) || 0));
        earned += Math.min(maxCarry, Math.max(0, Number(prev.earned_leave) || 0));
      }
      seedRows.push({
        employeeId: String(emp.id),
        casual: roundHalf(casual),
        sick: roundHalf(sick),
        earned: roundHalf(earned),
        wfh,
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

export async function getPendingDaysThisMonthByType(
  query: QueryFn,
  employeeId: string,
  leaveType: BalanceLeaveType
): Promise<number> {
  const res = await query(
    `SELECT COALESCE(SUM(days_count), 0)::float AS pending_days
     FROM leave_requests
     WHERE employee_id = $1
       AND leave_type = $2
       AND status = 'pending'
       AND start_date >= date_trunc('month', CURRENT_DATE)
       AND start_date < date_trunc('month', CURRENT_DATE) + interval '1 month'`,
    [employeeId, leaveType]
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
  const leaveSettings = await loadLeaveSettings(query);
  if (leaveSettings?.allowNegativeBalance) return;

  const y = currentYear(year);
  const bal = await ensureLeaveBalance(query, employeeId, y);
  const col = COLUMN_BY_TYPE[leaveType];
  const stored = Number(bal[col] || 0);

  const empRes = await query(
    `SELECT role, date_of_joining FROM employees WHERE id = $1 LIMIT 1`,
    [employeeId]
  );
  const emp = empRes.rows[0] || {};
  const annual = quotasFromSettings(leaveSettings, emp.role)[leaveType];
  const months = monthsElapsedThisYear(emp.date_of_joining);
  const entitlement = grantForType(annual, leaveSettings, months);
  const expireMonthly = isMonthlyGrant(leaveSettings) && !monthlyRolloverEnabled(leaveSettings);

  const consumed = await loadConsumedDaysBatch(query, [employeeId], y);
  const usedYear = consumed.get(String(employeeId))?.[leaveType] || 0;
  let usedPeriod = usedYear;
  if (expireMonthly) {
    const monthUsed = await loadConsumedThisMonthBatch(query, [employeeId]);
    usedPeriod = monthUsed.get(String(employeeId))?.[leaveType] || 0;
  }

  const policyRemaining = Math.max(0, roundHalf(entitlement - usedPeriod));
  const remaining = roundHalf(Math.min(stored, policyRemaining));
  const pending = expireMonthly
    ? await getPendingDaysThisMonthByType(query, employeeId, leaveType)
    : await getPendingDaysByType(query, employeeId, leaveType, y);
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

export type ConsumedDays = Record<BalanceLeaveType, number>;

const EMPTY_CONSUMED: ConsumedDays = { casual: 0, sick: 0, earned: 0, wfh: 0 };

/**
 * Net days consumed per employee/type this year (approval debits minus cancel credits).
 * remaining + consumed = total entitlement, which also holds for rows seeded without ledger entries.
 */
export async function loadConsumedDaysBatch(
  query: QueryFn,
  employeeIds: string[],
  year?: number
): Promise<Map<string, ConsumedDays>> {
  const result = new Map<string, ConsumedDays>();
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  const res = await query(
    `SELECT employee_id, leave_type, COALESCE(-SUM(delta), 0)::float AS consumed
     FROM leave_balance_transactions
     WHERE year = $1
       AND employee_id = ANY($2::uuid[])
       AND reason IN ('approve', 'cancel_credit')
     GROUP BY employee_id, leave_type`,
    [currentYear(year), uniqueIds]
  );
  for (const row of res.rows) {
    const id = String(row.employee_id);
    const entry = result.get(id) || { ...EMPTY_CONSUMED };
    if (isDebitableLeaveType(row.leave_type)) {
      entry[row.leave_type as BalanceLeaveType] = Math.max(0, Number(row.consumed) || 0);
    }
    result.set(id, entry);
  }
  return result;
}

export async function loadConsumedThisMonthBatch(
  query: QueryFn,
  employeeIds: string[]
): Promise<Map<string, ConsumedDays>> {
  const result = new Map<string, ConsumedDays>();
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  const res = await query(
    `SELECT employee_id, leave_type, COALESCE(SUM(days_count), 0)::float AS consumed
     FROM leave_requests
     WHERE employee_id = ANY($1::uuid[])
       AND status = 'approved'
       AND start_date >= date_trunc('month', CURRENT_DATE)
       AND start_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
     GROUP BY employee_id, leave_type`,
    [uniqueIds]
  );
  for (const row of res.rows) {
    const id = String(row.employee_id);
    const entry = result.get(id) || { ...EMPTY_CONSUMED };
    if (isDebitableLeaveType(row.leave_type)) {
      entry[row.leave_type as BalanceLeaveType] = Math.max(0, Number(row.consumed) || 0);
    }
    result.set(id, entry);
  }
  return result;
}

function policyRemainingForType(
  stored: number,
  annual: number,
  usedYear: number,
  usedMonth: number,
  leaveSettings: any,
  monthsElapsed: number
): { remaining: number; entitlement: number } {
  const entitlement = grantForType(annual, leaveSettings, monthsElapsed);
  const expireMonthly = isMonthlyGrant(leaveSettings) && !monthlyRolloverEnabled(leaveSettings);
  const usedPeriod = expireMonthly ? usedMonth : usedYear;
  const remaining = roundHalf(Math.min(Math.max(0, stored), Math.max(0, entitlement - usedPeriod)));
  return { remaining, entitlement: roundHalf(entitlement) };
}

export function serializeBalance(
  row: any,
  consumed?: ConsumedDays,
  policy?: {
    leaveSettings?: any;
    role?: string;
    joinDate?: string | Date | null;
    usedThisMonth?: ConsumedDays;
  }
) {
  if (!row) return null;
  const used = consumed || EMPTY_CONSUMED;
  const usedMonth = policy?.usedThisMonth || EMPTY_CONSUMED;
  const leaveSettings = policy?.leaveSettings || {};
  const annual = quotasFromSettings(leaveSettings, policy?.role);
  const months = monthsElapsedThisYear(policy?.joinDate);
  const casualP = policyRemainingForType(Number(row.casual_leave || 0), annual.casual, used.casual, usedMonth.casual, leaveSettings, months);
  const sickP = policyRemainingForType(Number(row.sick_leave || 0), annual.sick, used.sick, usedMonth.sick, leaveSettings, months);
  const earnedP = policyRemainingForType(Number(row.earned_leave || 0), annual.earned, used.earned, usedMonth.earned, leaveSettings, months);
  const wfh = Number(row.wfh || 0);
  return {
    employeeId: row.employee_id,
    year: row.year,
    casualLeave: casualP.remaining,
    sickLeave: sickP.remaining,
    earnedLeave: earnedP.remaining,
    wfh,
    used: {
      casualLeave: used.casual,
      sickLeave: used.sick,
      earnedLeave: used.earned,
      wfh: used.wfh,
    },
    usedThisMonth: {
      casualLeave: usedMonth.casual,
      sickLeave: usedMonth.sick,
      earnedLeave: usedMonth.earned,
      wfh: usedMonth.wfh,
    },
    totals: {
      casualLeave: annual.casual,
      sickLeave: annual.sick,
      earnedLeave: annual.earned,
      wfh: wfh + used.wfh,
    },
    entitlement: {
      casualLeave: casualP.entitlement,
      sickLeave: sickP.entitlement,
      earnedLeave: earnedP.entitlement,
      wfh: wfh + used.wfh,
    },
    grantMode: isMonthlyGrant(leaveSettings)
      ? monthlyRolloverEnabled(leaveSettings)
        ? 'monthly_rollover'
        : 'monthly_expire'
      : 'yearly',
    updatedAt: row.updated_at,
  };
}

export async function serializeBalances(
  query: QueryFn,
  rows: any[],
  consumed: Map<string, ConsumedDays>
): Promise<any[]> {
  if (!rows.length) return [];
  const leaveSettings = await loadLeaveSettings(query);
  const ids = rows.map((row) => String(row.employee_id));
  const empRes = await query(
    `SELECT id, role, date_of_joining FROM employees WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const empById = new Map<string, any>(empRes.rows.map((emp: any) => [String(emp.id), emp]));
  const usedMonth = isMonthlyGrant(leaveSettings) && !monthlyRolloverEnabled(leaveSettings)
    ? await loadConsumedThisMonthBatch(query, ids)
    : new Map<string, ConsumedDays>();

  return rows.map((row) => {
    const emp = empById.get(String(row.employee_id)) || {};
    return serializeBalance(row, consumed.get(String(row.employee_id)), {
      leaveSettings,
      role: emp.role,
      joinDate: emp.date_of_joining,
      usedThisMonth: usedMonth.get(String(row.employee_id)),
    });
  });
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
