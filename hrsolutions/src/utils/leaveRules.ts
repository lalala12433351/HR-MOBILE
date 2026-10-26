import { Employee, UserPersona, LeaveRequest, CustomizableOptions } from '@/types';

/**
 * Safely rounds leave day quantities to the nearest half-day.
 * Supports 0.5d leave increments while eliminating accrual float noise (e.g. 9.47 -> 9.5).
 */
export const formatLeaveDays = (days: number | string | undefined | null): number => {
  if (days === undefined || days === null || days === '') return 0;
  const num = Number(days);
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 2) / 2;
};

/**
 * Normalizes an employee role, designation, or employment type to one of the canonical role leave quota keys.
 */
export const normalizeRoleForLeaveQuotas = (
  role?: string,
  designation?: string,
  employmentType?: string
): 'admin' | 'hr_manager' | 'manager' | 'team_lead' | 'employee' | 'contractor' | 'intern' => {
  const r = (role || '').toLowerCase();
  const d = (designation || '').toLowerCase();
  const empType = (employmentType || '').toLowerCase();

  if (empType === 'contract' || empType === 'contractor') return 'contractor';
  if (empType === 'intern') return 'intern';

  // Auth role is the source of truth. Job titles like "Account Manager" must not
  // switch an employee onto the manager leave policy.
  if (r === 'super_admin' || r === 'admin') return 'admin';
  if (r === 'hr_manager' || r === 'hr') return 'hr_manager';
  if (r === 'team_lead') return 'team_lead';
  if (r === 'manager' || r === 'project_manager' || r === 'sales_manager' || r === 'finance_manager') {
    return 'manager';
  }
  if (r.includes('contract')) return 'contractor';
  if (r === 'intern') return 'intern';
  if (r === 'employee' || r === 'faculty' || r === 'student') return 'employee';

  if (/\bcontract(or)?\b/.test(d)) return 'contractor';
  if (/\bintern\b/.test(d)) return 'intern';
  if (/\b(team|tech) lead\b/.test(d)) return 'team_lead';
  if (/\bmanager\b/.test(d)) return 'manager';
  return 'employee';
};

function probationToken(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** Calendar date in local time. Date-only strings must not shift a day via UTC. */
function parseLocalDate(value?: string | null): Date | null {
  if (!value) return null;
  const text = String(value).trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addCalendarMonths(date: Date, months: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setMonth(next.getMonth() + months);
  return next;
}

function resolveProbationEnd(
  employee: Partial<Employee>,
  probationSettings?: CustomizableOptions['probationSettings']
): Date | null {
  const explicit = parseLocalDate(employee.probationEndDate);
  if (explicit) return explicit;
  const join = parseLocalDate(employee.joiningDate || (employee as { joinDate?: string }).joinDate);
  if (!join) return null;
  const months = employee.probationPeriodMonths ?? (probationSettings?.defaultDurationMonths || 3);
  if (!Number.isFinite(months) || months <= 0) return join;
  return addCalendarMonths(join, months);
}

/**
 * Determines if an employee is currently on probation.
 * Active employment is not probation. A joining date alone must not zero leave.
 * An explicit in-probation flag ends once the probation end date has passed.
 */
export const isEmployeeInProbation = (
  employee?: Partial<Employee> | null,
  probationSettings?: CustomizableOptions['probationSettings']
): boolean => {
  if (!employee) return false;
  if (probationSettings?.enabled === false) return false;

  const flag = probationToken(employee.probationStatus);
  if (flag === 'confirmed' || flag === 'completed' || flag === 'passed') return false;

  const employment = probationToken(employee.employmentStatus || (employee as { employment_status?: string }).employment_status);
  const explicit =
    flag === 'in_probation' ||
    flag === 'extended' ||
    flag === 'probation' ||
    flag === 'on_probation' ||
    (employee as { isProbation?: boolean }).isProbation === true ||
    employment === 'on_probation' ||
    employment === 'probation' ||
    employment === 'in_probation';

  const end = resolveProbationEnd(employee, probationSettings);
  const periodOver =
    probationSettings?.autoConfirmAfterPeriod !== false &&
    end != null &&
    startOfToday().getTime() >= end.getTime();

  if (explicit) {
    if (periodOver && flag !== 'extended') return false;
    if (periodOver && flag === 'extended' && employee.probationEndDate) return false;
    return true;
  }

  // Confirmed hires are stored as employment_status = active with no probation flag.
  // Do not invent a probation window from date of joining.
  if (employment === 'active' || employment === 'confirmed') return false;
  if (employment) return false;

  if (!employee.joiningDate && !(employee as { joinDate?: string }).joinDate) return false;
  if (!end) return false;
  return startOfToday().getTime() < end.getTime();
};

/**
 * Checks if a leave type is considered a paid leave.
 */
export const isPaidLeaveType = (leaveType: string, isPaidExplicit?: boolean): boolean => {
  if (isPaidExplicit === false) return false;
  const lt = (leaveType || '').toLowerCase();
  if (lt.includes('loss of pay') || lt.includes('lop') || lt.includes('unpaid')) return false;
  return true;
};

/**
 * Calculates effective leave quotas for an employee, keeping roleLeaveQuotas, monthly accruals, carry-overs, and probation restrictions in sync.
 */
export const getEffectiveLeaveQuotas = (
  employee: Partial<Employee> | Partial<UserPersona> | null | undefined,
  leaveSettings?: CustomizableOptions['leaveSettings'],
  probationSettings?: CustomizableOptions['probationSettings']
) => {
  const inProbation =
    probationSettings?.restrictLeaveDuringProbation !== false &&
    isEmployeeInProbation(employee as any, probationSettings);

  const roleKey = normalizeRoleForLeaveQuotas(
    (employee as any)?.role,
    (employee as any)?.designation,
    (employee as any)?.employmentType
  );

  const roleQuotas = leaveSettings?.roleLeaveQuotas?.[roleKey] ||
    leaveSettings?.roleLeaveQuotas?.['employee'] || {
      casualLeave: leaveSettings?.casualLeaveQuota || 12,
      sickLeave: leaveSettings?.sickLeaveQuota || 10,
      earnedLeave: leaveSettings?.paidLeaveQuota || 15,
    };

  // Base annual quotas configured for this role
  const annualCasual = roleQuotas.casualLeave ?? (leaveSettings?.casualLeaveQuota || 12);
  const annualSick = roleQuotas.sickLeave ?? (leaveSettings?.sickLeaveQuota || 10);
  const annualEarned = roleQuotas.earnedLeave ?? (leaveSettings?.paidLeaveQuota || 15);
  const compOff = (employee as any)?.leaveBalances?.compOff ?? 24;

  const policiesEnabled = leaveSettings?.leavePoliciesEnabled !== false;
  const isMonthly = policiesEnabled && leaveSettings?.accrualFrequency === 'monthly';
  const enableMonthlyRollover = leaveSettings?.enableMonthlyRollover !== false;
  const enableCarryOver = policiesEnabled && leaveSettings?.enableCarryOver !== false;
  const maxCarryOverCap = leaveSettings?.maxCarryForwardDays ?? 10;

  const monthlyRates = {
    casualLeave: formatLeaveDays(annualCasual / 12),
    sickLeave: formatLeaveDays(annualSick / 12),
    earnedLeave: formatLeaveDays(annualEarned / 12),
  };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth() + 1; // 1-12

  let monthsElapsed = currentMonthIdx;
  const joinDateStr = (employee as any)?.joinDate || (employee as any)?.joiningDate;
  if (joinDateStr) {
    const joinDate = new Date(joinDateStr);
    if (!isNaN(joinDate.getTime())) {
      const joinYear = joinDate.getFullYear();
      const joinMonth = joinDate.getMonth() + 1;
      if (joinYear === currentYear) {
        monthsElapsed = Math.max(1, Math.min(12, currentMonthIdx - joinMonth + 1));
      } else if (joinYear > currentYear) {
        monthsElapsed = 0;
      } else {
        monthsElapsed = currentMonthIdx;
      }
    }
  }

  const grantForYear = (annual: number, monthlyRate: number) => {
    if (!isMonthly) return formatLeaveDays(annual);
    if (!enableMonthlyRollover) return monthlyRate;
    return formatLeaveDays(Math.min(annual, (annual / 12) * monthsElapsed));
  };

  const accruedCasual = grantForYear(annualCasual, monthlyRates.casualLeave);
  const accruedSick = grantForYear(annualSick, monthlyRates.sickLeave);
  const accruedEarned = grantForYear(annualEarned, monthlyRates.earnedLeave);

  // Only real ledger carry-over counts — do not invent leftover days from the cap.
  const rawCarryOver = enableCarryOver ? (employee as any)?.carriedOverLeaves || {} : {};
  const carryOver = {
    casualLeave: formatLeaveDays(rawCarryOver.casualLeave || 0),
    sickLeave: formatLeaveDays(rawCarryOver.sickLeave || 0),
    earnedLeave: formatLeaveDays(rawCarryOver.earnedLeave || 0),
    total: 0,
  };
  carryOver.total = formatLeaveDays(
    Math.min(maxCarryOverCap, carryOver.casualLeave + carryOver.sickLeave + carryOver.earnedLeave)
  );

  // If the admin explicitly provided a custom override in EmployeeDetailView, or server ledger is hydrated:
  const hasServerBalances = !!(employee as any)?.leaveBalancesFromServer;
  const hasOverride = !!(employee as any)?.hasCustomLeaveOverride || hasServerBalances;
  const rawCalculatedCasual = hasOverride && (employee as any)?.leaveBalances?.casualLeave !== undefined
    ? formatLeaveDays((employee as any).leaveBalances.casualLeave)
    : formatLeaveDays(accruedCasual + (enableCarryOver ? carryOver.casualLeave : 0));

  const rawCalculatedSick = hasOverride && (employee as any)?.leaveBalances?.sickLeave !== undefined
    ? formatLeaveDays((employee as any).leaveBalances.sickLeave)
    : formatLeaveDays(accruedSick + (enableCarryOver ? carryOver.sickLeave : 0));

  const rawCalculatedEarned = hasOverride && (employee as any)?.leaveBalances?.earnedLeave !== undefined
    ? formatLeaveDays((employee as any).leaveBalances.earnedLeave)
    : formatLeaveDays(accruedEarned + (enableCarryOver ? carryOver.earnedLeave : 0));

  // During probation, paid leaves (Casual, Sick, Earned) are restricted and set to 0.
  // All absences must be logged as Loss of Pay (LOP / Unpaid).
  const effectiveCasual = inProbation ? 0 : Math.max(0, rawCalculatedCasual);
  const effectiveSick = inProbation ? 0 : Math.max(0, rawCalculatedSick);
  const effectiveEarned = inProbation ? 0 : Math.max(0, rawCalculatedEarned);
  const effectiveCompOff = inProbation
    ? 0
    : hasServerBalances && (employee as any)?.leaveBalances?.compOff !== undefined
      ? formatLeaveDays((employee as any).leaveBalances.compOff)
      : compOff;

  return {
    roleKey,
    inProbation,
    isProbationRestricted: inProbation,
    balancesFromServer: hasServerBalances,
    leavePoliciesEnabled: policiesEnabled,
    enableMonthlyRollover: isMonthly && enableMonthlyRollover,
    probationPolicyNotice: inProbation
      ? 'Paid leaves (Casual, Sick, Earned) are restricted during probation. All absences must be logged as Loss of Pay (LOP / Unpaid).'
      : undefined,
    annualQuotas: {
      casualLeave: formatLeaveDays(annualCasual),
      sickLeave: formatLeaveDays(annualSick),
      earnedLeave: formatLeaveDays(annualEarned),
      compOff: formatLeaveDays(compOff),
    },
    effectiveQuotas: {
      casualLeave: formatLeaveDays(effectiveCasual),
      sickLeave: formatLeaveDays(effectiveSick),
      earnedLeave: formatLeaveDays(effectiveEarned),
      compOff: formatLeaveDays(effectiveCompOff),
    },
    monthlyRates,
    accruedThisCycle: {
      casualLeave: inProbation ? 0 : formatLeaveDays(accruedCasual),
      sickLeave: inProbation ? 0 : formatLeaveDays(accruedSick),
      earnedLeave: inProbation ? 0 : formatLeaveDays(accruedEarned),
    },
    carryOver: inProbation
      ? { casualLeave: 0, sickLeave: 0, earnedLeave: 0, total: 0 }
      : carryOver,
    isMonthlyCycle: isMonthly,
    accrualFrequency: isMonthly ? ('monthly' as const) : ('annual' as const),
    currentMonthIdx,
    monthsElapsed,
  };
};

/**
 * Validates whether a leave can be approved.
 * Returns an object with permission, violation flag, reason, and suggested action.
 */
export const validateLeaveApproval = (
  leave: LeaveRequest,
  employee: Partial<Employee> | null | undefined,
  probationSettings?: CustomizableOptions['probationSettings']
): {
  canApproveAsPaid: boolean;
  isProbationViolation: boolean;
  message?: string;
  suggestedAction?: 'approve_as_lop' | 'reject';
} => {
  const inProbation =
    probationSettings?.restrictLeaveDuringProbation !== false &&
    isEmployeeInProbation(employee, probationSettings);
  const isPaid = isPaidLeaveType(leave.leaveType, (leave as any).isPaid);

  if (inProbation && isPaid) {
    return {
      canApproveAsPaid: false,
      isProbationViolation: true,
      message: `Employee ${leave.employeeName} is currently on probation. Paid leaves (${leave.leaveType}) are strictly restricted during probation. Approve as Loss of Pay (LOP / Unpaid) or reject.`,
      suggestedAction: 'approve_as_lop',
    };
  }

  return {
    canApproveAsPaid: true,
    isProbationViolation: false,
  };
};
