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

/**
 * Determines if an employee is currently on probation.
 */
export const isEmployeeInProbation = (
  employee?: Partial<Employee> | null,
  probationSettings?: CustomizableOptions['probationSettings']
): boolean => {
  if (!employee) return false;
  // If explicitly confirmed
  if (employee.probationStatus === 'confirmed') return false;
  // If explicitly flagged as in probation or extended
  if (
    employee.probationStatus === 'in_probation' ||
    employee.probationStatus === 'extended' ||
    (employee as any).isProbation === true
  ) {
    return true;
  }
  // Check if probation policy is enabled and check joining date vs duration
  if (probationSettings?.enabled !== false && employee.joiningDate) {
    const months = employee.probationPeriodMonths ?? (probationSettings?.defaultDurationMonths || 3);
    const joinDate = new Date(employee.joiningDate);
    if (!isNaN(joinDate.getTime())) {
      const endDate = new Date(joinDate);
      endDate.setMonth(endDate.getMonth() + months);
      if (new Date() < endDate) {
        return true;
      }
    }
  }
  return false;
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
  const inProbation = isEmployeeInProbation(employee as any, probationSettings);

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
  const inProbation = isEmployeeInProbation(employee, probationSettings);
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
