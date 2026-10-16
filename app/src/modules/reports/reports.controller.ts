import { Request, Response } from 'express';
import { getAccessScope } from '../../utils/employeeScope.js';

type ReportPeriod = { startDate: string; endDate: string; departmentId?: string };

function isoDate(value: unknown): string | null {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function getPeriod(req: Request, res: Response): ReportPeriod | null {
  const startDate = isoDate(req.query.startDate);
  const endDate = isoDate(req.query.endDate);
  if (!startDate || !endDate || startDate > endDate) {
    res.status(400).json({ success: false, error: { code: 'INVALID_PERIOD', message: 'Provide a valid startDate and endDate.' } });
    return null;
  }
  return { startDate, endDate, departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined };
}

function scopedEmployeeCte(scope: Awaited<ReturnType<typeof getAccessScope>>, period: ReportPeriod) {
  const params: unknown[] = [];
  let scopeClause = 'TRUE';
  if (scope.kind !== 'all') {
    params.push(scope.employeeIds);
    scopeClause = `e.id = ANY($${params.length}::uuid[])`;
  }
  let departmentClause = '';
  if (period.departmentId) {
    params.push(period.departmentId);
    departmentClause = ` AND d.id::text = $${params.length}`;
  }
  return {
    params,
    cte: `WITH scoped_employees AS (
      SELECT e.id, e.employee_code, e.first_name, e.last_name, e.account_status, d.name AS department
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE ${scopeClause}${departmentClause}
    )`,
  };
}

export async function getReportSummary(req: Request, res: Response): Promise<void> {
  try {
    const period = getPeriod(req, res);
    if (!period) return;
    const scope = await getAccessScope(req);
    const scoped = scopedEmployeeCte(scope, period);
    const params = [...scoped.params, period.startDate, period.endDate];
    const startIndex = params.length - 1;
    const endIndex = params.length;
    const [headcount, attendance, leaves, regularizations, delivery] = await Promise.all([
      req.tenantQuery!(`${scoped.cte}
        SELECT COUNT(*) FILTER (WHERE account_status IS DISTINCT FROM 'Deactivated')::int AS active_headcount,
               COUNT(*)::int AS people_count
        FROM scoped_employees`, scoped.params),
      req.tenantQuery!(`${scoped.cte}, daily_attendance AS (
          SELECT DISTINCT p.employee_id, DATE(p.punch_timestamp) AS day,
            BOOL_OR(p.punch_type = 'check_in') AS present,
            BOOL_OR(p.punch_type = 'check_in' AND p.punch_timestamp::time > TIME '09:15') AS late,
            SUM(CASE WHEN p.punch_type = 'check_out' THEN 1 ELSE 0 END) AS check_outs
          FROM attendance_punches p
          INNER JOIN scoped_employees e ON e.id = p.employee_id
          WHERE p.punch_timestamp >= $${startIndex}::date
            AND p.punch_timestamp < ($${endIndex}::date + INTERVAL '1 day')
          GROUP BY p.employee_id, DATE(p.punch_timestamp)
        )
        SELECT COUNT(*) FILTER (WHERE present)::int AS present_days,
          COUNT(*) FILTER (WHERE late)::int AS late_arrivals,
          COUNT(*)::int AS recorded_days
        FROM daily_attendance`, params),
      req.tenantQuery!(`${scoped.cte}
        SELECT COALESCE(SUM(l.days_count) FILTER (WHERE l.status = 'approved'), 0)::float AS approved_leave_days,
          COUNT(*) FILTER (WHERE l.status = 'pending')::int AS pending_leave_requests
        FROM leave_requests l
        INNER JOIN scoped_employees e ON e.id = l.employee_id
        WHERE l.start_date <= $${endIndex}::date AND l.end_date >= $${startIndex}::date`, params),
      req.tenantQuery!(`${scoped.cte}
        SELECT COUNT(*) FILTER (WHERE r.status = 'pending')::int AS pending_regularizations
        FROM attendance_regularizations r
        INNER JOIN scoped_employees e ON e.id = r.employee_id
        WHERE r.date >= $${startIndex}::date AND r.date <= $${endIndex}::date`, params),
      req.tenantQuery!(`${scoped.cte}
        SELECT COUNT(*)::int AS total_tasks,
          COUNT(*) FILTER (WHERE t.status IN ('done', 'completed', 'approved'))::int AS completed_tasks,
          COUNT(*) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status NOT IN ('done', 'completed', 'approved'))::int AS overdue_tasks
        FROM project_tasks t
        INNER JOIN scoped_employees e ON e.id = t.assigned_to_employee_id`, scoped.params),
    ]);
    const activeHeadcount = Number(headcount.rows[0]?.active_headcount || 0);
    const recordedDays = Number(attendance.rows[0]?.recorded_days || 0);
    const totalTasks = Number(delivery.rows[0]?.total_tasks || 0);
    res.json({
      success: true,
      data: {
        period,
        scope: scope.kind,
        workforce: { activeHeadcount, peopleCount: Number(headcount.rows[0]?.people_count || 0) },
        attendance: {
          presentDays: Number(attendance.rows[0]?.present_days || 0),
          lateArrivals: Number(attendance.rows[0]?.late_arrivals || 0),
          recordedDays,
          attendanceRate: activeHeadcount && recordedDays ? Number(((Number(attendance.rows[0]?.present_days || 0) / recordedDays) * 100).toFixed(1)) : 0,
        },
        leave: { approvedDays: Number(leaves.rows[0]?.approved_leave_days || 0), pendingRequests: Number(leaves.rows[0]?.pending_leave_requests || 0) },
        compliance: { pendingRegularizations: Number(regularizations.rows[0]?.pending_regularizations || 0) },
        delivery: { totalTasks, completedTasks: Number(delivery.rows[0]?.completed_tasks || 0), overdueTasks: Number(delivery.rows[0]?.overdue_tasks || 0) },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'REPORTING_ERROR', message: error.message } });
  }
}

export async function exportReportCsv(req: Request, res: Response): Promise<void> {
  try {
    const period = getPeriod(req, res);
    if (!period) return;
    const scope = await getAccessScope(req);
    const scoped = scopedEmployeeCte(scope, period);
    const params = [...scoped.params, period.startDate, period.endDate];
    const startIndex = params.length - 1;
    const endIndex = params.length;
    const result = await req.tenantQuery!(`${scoped.cte}
      SELECT e.employee_code, CONCAT_WS(' ', e.first_name, NULLIF(e.last_name, 'User')) AS employee,
        e.department,
        COUNT(DISTINCT DATE(p.punch_timestamp)) FILTER (WHERE p.punch_type = 'check_in')::int AS present_days,
        COUNT(DISTINCT DATE(p.punch_timestamp)) FILTER (WHERE p.punch_type = 'check_in' AND p.punch_timestamp::time > TIME '09:15')::int AS late_arrivals
      FROM scoped_employees e
      LEFT JOIN attendance_punches p ON p.employee_id = e.id
        AND p.punch_timestamp >= $${startIndex}::date
        AND p.punch_timestamp < ($${endIndex}::date + INTERVAL '1 day')
      GROUP BY e.id, e.employee_code, e.first_name, e.last_name, e.department
      ORDER BY employee ASC`, params);
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [['Employee ID', 'Employee', 'Department', 'Present days', 'Late arrivals'], ...result.rows.map((row: any) => [row.employee_code, row.employee, row.department, row.present_days, row.late_arrivals])]
      .map((row) => row.map(quote).join(','))
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${period.startDate}_${period.endDate}.csv"`);
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: { code: 'REPORT_EXPORT_ERROR', message: error.message } });
  }
}
