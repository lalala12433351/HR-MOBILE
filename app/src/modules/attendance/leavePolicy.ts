type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

export type ApprovalWorkflow = 'manager_then_hr' | 'manager_only' | 'hr_only';

export type LeavePolicy = {
  approvalWorkflow: ApprovalWorkflow;
  restrictDuringNoticePeriod: boolean;
  enableCompOff: boolean;
  maxConsecutiveDaysWithoutDoc: number;
  restrictLeaveDuringProbation: boolean;
  probationMonths: number;
  autoConfirmAfterPeriod: boolean;
};

const PAID = new Set(['casual', 'sick', 'earned']);

export function isPaidLeaveType(leaveType: string): boolean {
  return PAID.has(String(leaveType || '').toLowerCase());
}

export async function loadLeavePolicy(query: QueryFn): Promise<LeavePolicy> {
  const defaults: LeavePolicy = {
    approvalWorkflow: 'manager_then_hr',
    restrictDuringNoticePeriod: true,
    enableCompOff: true,
    maxConsecutiveDaysWithoutDoc: 3,
    restrictLeaveDuringProbation: true,
    probationMonths: 3,
    autoConfirmAfterPeriod: true,
  };
  try {
    const res = await query(`SELECT value FROM tenant_settings WHERE key = 'attendance' LIMIT 1`);
    const blob = res.rows[0]?.value || {};
    const leave = blob.leaveSettings || blob.leave_settings || {};
    const probation = blob.probationSettings || blob.probation_settings || {};
    const workflow = String(leave.approvalWorkflow || '');
    return {
      approvalWorkflow:
        workflow === 'manager_only' || workflow === 'hr_only' || workflow === 'manager_then_hr'
          ? workflow
          : defaults.approvalWorkflow,
      restrictDuringNoticePeriod: leave.restrictDuringNoticePeriod !== false,
      enableCompOff: leave.enableCompOff !== false,
      maxConsecutiveDaysWithoutDoc: Math.max(1, Number(leave.maxConsecutiveDaysWithoutDoc) || 3),
      restrictLeaveDuringProbation: probation.restrictLeaveDuringProbation !== false,
      probationMonths: Math.max(1, Number(probation.defaultDurationMonths) || 3),
      autoConfirmAfterPeriod: probation.autoConfirmAfterPeriod !== false,
    };
  } catch {
    return defaults;
  }
}

export async function ensureLeaveAttachmentColumn(query: QueryFn): Promise<void> {
  await query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT`);
}

function dateOnly(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function calendarDate(value: unknown): string {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function addMonthsIso(start: string, months: number): string {
  const [year, month, day] = start.split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  date.setMonth(date.getMonth() + months);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

/** Paid leave stays blocked only while probation is still open. */
function isStillOnProbation(row: any, policy: LeavePolicy): boolean {
  const flag = String(row?.probation_status || '').trim().toLowerCase();
  if (flag === 'confirmed') return false;
  const employment = String(row?.employment_status || '').trim().toLowerCase();
  const explicit =
    employment === 'on_probation' || flag === 'in_probation' || flag === 'extended' || flag === 'probation';
  if (!explicit) return false;
  if (!policy.autoConfirmAfterPeriod) return true;

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const explicitEnd = calendarDate(row?.probation_end_date);
  const join = calendarDate(row?.date_of_joining);
  const end =
    explicitEnd ||
    (flag === 'extended' ? '' : join ? addMonthsIso(join, policy.probationMonths) : '');
  if (!end) return true;
  return end > todayIso;
}

export async function assertLeaveRequestAllowed(
  query: QueryFn,
  args: {
    employeeId: string;
    leaveType: string;
    daysCount: number;
    attachmentUrl?: string | null;
  }
): Promise<void> {
  const policy = await loadLeavePolicy(query);
  const leaveType = String(args.leaveType || '').toLowerCase();
  if (leaveType === 'wfh' && !policy.enableCompOff) {
    throw Object.assign(new Error('Comp-off is turned off, so work-from-home credit cannot be requested.'), {
      code: 'COMP_OFF_DISABLED',
    });
  }
  if (
    args.daysCount > policy.maxConsecutiveDaysWithoutDoc &&
    !String(args.attachmentUrl || '').trim()
  ) {
    throw Object.assign(
      new Error(
        `Leave longer than ${policy.maxConsecutiveDaysWithoutDoc} days needs a supporting document.`
      ),
      { code: 'DOCUMENT_REQUIRED' }
    );
  }

  let row: any;
  try {
    const emp = await query(
      `SELECT employment_status, date_of_joining, exit_date, notice_period_end, custom_field_values,
              probation_status, probation_end_date
       FROM employees WHERE id = $1 LIMIT 1`,
      [args.employeeId]
    );
    row = emp.rows[0];
  } catch {
    const emp = await query(
      `SELECT employment_status, date_of_joining, exit_date, notice_period_end, custom_field_values
       FROM employees WHERE id = $1 LIMIT 1`,
      [args.employeeId]
    );
    row = emp.rows[0];
  }
  if (!row || !isPaidLeaveType(leaveType)) return;

  if (policy.restrictLeaveDuringProbation && isStillOnProbation(row, policy)) {
    throw Object.assign(new Error('Paid leave is restricted during probation. Use unpaid leave.'), {
      code: 'PROBATION_RESTRICTED',
    });
  }

  if (!policy.restrictDuringNoticePeriod) return;
  const custom = row.custom_field_values && typeof row.custom_field_values === 'object' ? row.custom_field_values : {};
  const noticeEnd = dateOnly(row.notice_period_end) || dateOnly(custom.noticePeriodEndDate);
  const exitDate = dateOnly(row.exit_date) || dateOnly(custom.exitDate);
  const today = new Date().toISOString().slice(0, 10);
  const inNotice = (noticeEnd && noticeEnd >= today) || (exitDate && exitDate >= today);
  if (inNotice) {
    throw Object.assign(new Error('Paid leave is blocked during the notice period.'), {
      code: 'NOTICE_RESTRICTED',
    });
  }
}

export function nextLeaveDecision(args: {
  workflow: ApprovalWorkflow;
  callerIsOrgWide: boolean;
  callerIsManager: boolean;
  currentStatus: string;
  requested: 'approved' | 'rejected';
}): { status: string } | { error: string } {
  const current = String(args.currentStatus || 'pending').toLowerCase();
  if (args.requested === 'rejected') {
    if (args.workflow === 'hr_only' && !args.callerIsOrgWide) {
      return { error: 'Only HR can decide leave while the approval path is HR only.' };
    }
    if (args.workflow === 'manager_only' && !args.callerIsManager) {
      return { error: 'Only the reporting manager can decide leave while the approval path is manager only.' };
    }
    if (args.workflow === 'manager_then_hr' && current === 'manager_approved' && !args.callerIsOrgWide) {
      return { error: 'HR has to make the final leave decision.' };
    }
    if (args.workflow === 'manager_then_hr' && current === 'pending' && !args.callerIsManager && !args.callerIsOrgWide) {
      return { error: 'Only the reporting manager can decide this leave.' };
    }
    return { status: 'rejected' };
  }

  if (args.workflow === 'hr_only') {
    if (!args.callerIsOrgWide) return { error: 'Only HR can approve leave while the approval path is HR only.' };
    return { status: 'approved' };
  }
  if (args.workflow === 'manager_only') {
    if (!args.callerIsManager) return { error: 'Only the reporting manager can approve leave.' };
    return { status: 'approved' };
  }
  if (current === 'manager_approved') {
    if (!args.callerIsOrgWide) return { error: 'HR has to confirm this leave after the manager.' };
    return { status: 'approved' };
  }
  if (!args.callerIsManager) {
    return { error: 'The reporting manager has to approve this leave before HR.' };
  }
  return { status: 'manager_approved' };
}
