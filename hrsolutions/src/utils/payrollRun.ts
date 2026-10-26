import { applyHoursMethod, isAlternateOffDay, isScheduledWorkingDay, onOrAfterStart } from '@/utils/attendanceRules';
import {
  AttendancePaySettings,
  AttendanceRecord,
  DEFAULT_ATTENDANCE_PAY,
  Employee,
  LeaveRequest,
  PayrollDeductionLine,
  PayrollGroup,
  PayrollIncentive,
  PayrollRecord,
  PayrollRunDraft,
  PayrollSettings,
  SalaryComponentDefinition,
  SalaryType,
  TimesheetEntry,
} from '@/types';
import { paidHolidayDates, type HolidayLike } from '@/utils/holidays';
import { leaveBelongsToEmployee } from '@/utils/mapLeaveRow';
import { isWfhLeaveType } from '@/utils/dashboardPeople';
import { isPaidLeaveType } from '@/utils/leaveRules';

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export type PayrollPeriod = {
  year: number;
  month: number;
  monthYear: string;
  start: string;
  end: string;
  attendanceEnd: string;
  disbursementDay: number;
  attendanceCutoffDay: number;
};

export type PayrollCompanyTotals = {
  employeeCount: number;
  totalGross: number;
  totalIncentives: number;
  totalLop: number;
  totalDeductions: number;
  totalNet: number;
  shortHoursCount: number;
  disbursementDay: number;
  periodLabel: string;
};

export type PayrollRunInput = {
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  timesheets?: TimesheetEntry[];
  groups: PayrollGroup[];
  settings?: PayrollSettings;
  salaryComponents?: SalaryComponentDefinition[];
  incentives?: PayrollIncentive[];
  fullDayMinimumHours?: number;
  companyCreatedAt?: string;
  workingDays?: string[];
  holidays?: HolidayLike[];
  timeZone?: string;
  year: number;
  month: number;
  periodSlice?: string;
  attendanceSettings?: {
    hoursCalculationMethod?: 'every_punch' | 'first_last' | 'strict_shift';
    fullDayMinimumHours?: number;
    startDate?: string;
    enableAlternateSaturdays?: boolean;
    alternateSaturdaysPolicy?: string;
  };
};

const dateKey = (value: Date) => {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDate = (value?: string) => {
  const raw = String(value || '').slice(0, 10);
  if (!raw) return null;
  const dt = new Date(`${raw}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? null : dt;
};

export function getPayrollPeriod(
  year: number,
  month: number,
  settings?: PayrollSettings,
  periodSlice?: string
): PayrollPeriod {
  const lastDay = new Date(year, month, 0).getDate();
  const frequency = String(settings?.defaultPayFrequency || 'Monthly').toLowerCase();
  const today = new Date();
  const inSelectedMonth = today.getFullYear() === year && today.getMonth() + 1 === month;
  let startDay = Math.min(Math.max(settings?.payCycleStartDay || 1, 1), lastDay);
  let endDay = Math.min(Math.max(settings?.payCycleEndDay || lastDay, startDay), lastDay);
  let labelSuffix = '';

  if (frequency === 'bi-weekly' || frequency === 'biweekly' || frequency === 'semi-monthly') {
    const secondHalf = periodSlice === 'second' || (periodSlice !== 'first' && inSelectedMonth && today.getDate() > 15);
    startDay = secondHalf ? 16 : 1;
    endDay = secondHalf ? lastDay : Math.min(15, lastDay);
    labelSuffix = secondHalf ? ' · 16–end' : ' · 1–15';
  } else if (frequency === 'weekly') {
    const picked = Number(periodSlice);
    const anchor = Number.isFinite(picked) && picked >= 1 ? Math.min(picked, lastDay) : inSelectedMonth ? today.getDate() : 1;
    startDay = Math.floor((anchor - 1) / 7) * 7 + 1;
    endDay = Math.min(startDay + 6, lastDay);
    labelSuffix = ` · ${startDay}–${endDay}`;
  }

  const cutoff = Math.min(Math.max(settings?.attendanceCutoffDay || endDay, startDay), endDay);
  const disbursement = Math.min(Math.max(settings?.disbursementDay || startDay, startDay), endDay);
  const startDate = new Date(year, month - 1, startDay);
  const endDate = new Date(year, month - 1, endDay);
  const attendanceEnd = new Date(year, month - 1, cutoff);
  const monthYear = `${startDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}${labelSuffix}`;
  return {
    year,
    month,
    monthYear,
    start: dateKey(startDate),
    end: dateKey(endDate),
    attendanceEnd: dateKey(attendanceEnd),
    disbursementDay: disbursement,
    attendanceCutoffDay: cutoff,
  };
}

function inRange(value: string | undefined, start: string, end: string) {
  const current = String(value || '').slice(0, 10);
  return Boolean(current && start <= end && current >= start && current <= end);
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function calendarDateInTimeZone(value?: string | null, timeZone?: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) {
    const day = raw.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
  }
  const zone = timeZone && timeZone.trim() ? timeZone.trim() : 'UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(dt);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (!year || !month || !day) return dt.toISOString().slice(0, 10);
    return `${year}-${month}-${day}`;
  } catch {
    return dt.toISOString().slice(0, 10);
  }
}

function dateOnly(value?: string | null): string | null {
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function laterDate(current: string, candidate?: string | null): string {
  const next = dateOnly(candidate);
  if (!next) return current;
  return next > current ? next : current;
}

function earlierDate(current: string, candidate?: string | null): string {
  const next = dateOnly(candidate);
  if (!next) return current;
  return next < current ? next : current;
}

function workingDayNames(days?: string[]): Set<string> {
  const source = days && days.length > 0 ? days : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  return new Set(source.map((day) => day.trim().toLowerCase()).filter(Boolean));
}

function isWorkingDay(day: string, names: Set<string>): boolean {
  const dt = parseDate(day);
  if (!dt) return false;
  return names.has(WEEKDAY_NAMES[dt.getDay()]);
}

function countWorkingDays(
  start: string,
  end: string,
  names: Set<string>,
  settings?: PayrollRunInput['attendanceSettings'],
  workingDays?: string[]
): number {
  if (start > end) return 0;
  return eachDateInclusive(start, end).filter(
    (day) =>
      onOrAfterStart(day, settings?.startDate) &&
      (workingDays
        ? isScheduledWorkingDay(day, workingDays, settings)
        : isWorkingDay(day, names) && !isAlternateOffDay(day, settings))
  ).length;
}

function eachDateInclusive(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = parseDate(start);
  const last = parseDate(end);
  if (!cursor || !last) return dates;
  while (cursor <= last) {
    dates.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function overlapDays(startDate: string, endDate: string, rangeStart: string, rangeEnd: string): string[] {
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  if (!start || !end) return [];
  const from = start > rangeStart ? start : rangeStart;
  const to = end < rangeEnd ? end : rangeEnd;
  if (from > to) return [];
  return eachDateInclusive(from, to);
}

export function resolvePayrollGroup(employee: Employee, groups: PayrollGroup[]): PayrollGroup | undefined {
  return (
    groups.find(
      (group) =>
        group.status !== 'inactive' &&
        (group.id === employee.payrollGroupId || (group.assignedEmployeeIds || []).includes(employee.id))
    ) || groups.find((group) => group.isDefault && group.status !== 'inactive')
  );
}

function isActiveEmployee(employee: Employee) {
  const status = String(employee.accountStatus || employee.status || 'Active');
  if (employee.isDeactivated) return false;
  return !['Deactivated', 'Terminated', 'Suspended'].includes(status);
}

function moneyFromPercent(base: number, percent: number) {
  return round2((base * (Number(percent) || 0)) / 100);
}

export function resolveAttendancePay(settings?: PayrollSettings): AttendancePaySettings {
  return { ...DEFAULT_ATTENDANCE_PAY, ...(settings?.attendancePay || {}) };
}

function computeLine(employee: Employee, period: PayrollPeriod, input: PayrollRunInput): PayrollRecord {
  const groups = input.groups || [];
  const settings = input.settings;
  const group = resolvePayrollGroup(employee, groups);
  const salaryType: SalaryType = employee.salaryType || group?.salaryType || settings?.defaultSalaryType || 'monthly';
  const configuredRequired = Number(group?.workingDaysPerMonth) || 22;
  const dayNames = workingDayNames(input.workingDays);
  const companyStart = calendarDateInTimeZone(input.companyCreatedAt, input.timeZone);
  const serviceStart = laterDate(
    laterDate(period.start, companyStart),
    employee.joiningDate || employee.joinDate
  );
  const serviceEnd = earlierDate(period.attendanceEnd, employee.exitDate);
  const coversFullWindow = serviceStart <= period.start && serviceEnd >= period.attendanceEnd;
  const monthWorkingDays = countWorkingDays(period.start, period.attendanceEnd, dayNames, input.attendanceSettings, input.workingDays);
  const serviceWorkingDays = countWorkingDays(serviceStart, serviceEnd, dayNames, input.attendanceSettings, input.workingDays);
  const requiredDays = coversFullWindow ? configuredRequired : serviceWorkingDays;
  const serviceFraction =
    coversFullWindow || monthWorkingDays <= 0 ? 1 : serviceWorkingDays / monthWorkingDays;
  const hoursPerDay = Number(group?.standardHoursPerDay) || Number(input.fullDayMinimumHours) || 8;
  const requiredHours = round2(requiredDays * hoursPerDay);
  const allowNegative = Boolean(settings?.allowNegativeNetPay);

  const attendancePay = resolveAttendancePay(settings);
  const useAttendance = settings?.autoCalculateFromAttendance !== false;
  const countsTowardQuota = (day: string) =>
    onOrAfterStart(day, input.attendanceSettings?.startDate) &&
    !isAlternateOffDay(day, input.attendanceSettings) &&
    (coversFullWindow || isWorkingDay(day, dayNames));

  const attendance = applyHoursMethod(input.attendance || [], input.attendanceSettings).filter(
    (row) =>
      (row.employeeId === employee.id ||
        (!!employee.employeeId && row.employeeId === employee.employeeId)) &&
      inRange(row.date, serviceStart, serviceEnd) &&
      onOrAfterStart(row.date, input.attendanceSettings?.startDate)
  );
  const leaves = (input.leaves || []).filter(
    (row) =>
      leaveBelongsToEmployee(row, employee) &&
      row.status === 'Approved' &&
      overlapDays(row.startDate, row.endDate, serviceStart, serviceEnd).length > 0
  );

  const creditedDates = new Set<string>();
  const halfDates = new Set<string>();
  const lopDates = new Set<string>();
  let hoursWorked = 0;
  let creditDays = 0;

  for (const row of attendance) {
    const day = String(row.date || '').slice(0, 10);
    if (!day) continue;
    hoursWorked += Number(row.workingHours) || 0;
    if (!countsTowardQuota(day)) continue;
    if (row.status === 'On Leave') continue;
    if (row.status === 'Absent') {
      if (useAttendance && attendancePay.lopFromAbsent) lopDates.add(day);
      continue;
    }
    if (row.status === 'Half Day') {
      creditDays += 0.5;
      creditedDates.add(day);
      halfDates.add(day);
      if (useAttendance && attendancePay.lopFromHalfDay) lopDates.add(`${day}:half`);
      continue;
    }
    creditDays += 1;
    creditedDates.add(day);
  }

  if (settings?.autoCalculateFromTimesheets !== false && salaryType === 'hourly') {
    const tsHours = (input.timesheets || [])
      .filter((row) => row.employeeId === employee.id && inRange(row.date, serviceStart, serviceEnd))
      .reduce((sum, row) => sum + (Number(row.hours) || 0), 0);
    if (tsHours > hoursWorked) hoursWorked = tsHours;
  }

  let holidayCreditDays = 0;
  for (const holiday of paidHolidayDates({
    holidays: input.holidays,
    start: serviceStart,
    end: serviceEnd,
    workingDays: input.workingDays,
  })) {
    const day = holiday.date;
    if (halfDates.has(day)) {
      creditDays += 0.5;
      holidayCreditDays += 0.5;
      halfDates.delete(day);
      lopDates.delete(`${day}:half`);
      continue;
    }
    if (creditedDates.has(day)) continue;
    lopDates.delete(day);
    creditDays += 1;
    holidayCreditDays += 1;
    creditedDates.add(day);
  }

  for (const leave of leaves) {
    if (isWfhLeaveType(leave.leaveType)) continue;
    const days = overlapDays(leave.startDate, leave.endDate, serviceStart, serviceEnd);
    const paid = isPaidLeaveType(leave.leaveType, leave.isPaid);
    for (const day of days) {
      if (!countsTowardQuota(day)) continue;
      if (creditedDates.has(day) || lopDates.has(day)) continue;
      if (paid) {
        creditDays += 1;
        creditedDates.add(day);
      } else if (attendancePay.lopFromUnpaidLeave) {
        lopDates.add(day);
      }
    }
  }

  const lopFromMarks = Array.from(lopDates).reduce((sum, key) => sum + (key.endsWith(':half') ? 0.5 : 1), 0);
  const shortfall =
    useAttendance && attendancePay.lopFromDayShortfall
      ? Math.max(0, round2(requiredDays - creditDays - lopFromMarks))
      : 0;
  let lopDays = round2(lopFromMarks + shortfall);
  const hoursMet =
    salaryType === 'hourly' ? hoursWorked + 0.0001 >= requiredHours : creditDays + 0.0001 >= requiredDays;

  const sd = employee.salaryDetails;
  const basic =
    Number(sd?.basic) || Number(employee.payrollSummary?.salary) || Number(group?.baseSalaryDefault) || 0;
  const hra = sd?.hra !== undefined ? Number(sd.hra) : Number(group?.hraDefault) || 0;
  const special =
    sd?.specialAllowance !== undefined ? Number(sd.specialAllowance) : Number(group?.specialAllowanceDefault) || 0;
  const conveyance =
    sd?.conveyanceAllowance !== undefined
      ? Number(sd.conveyanceAllowance)
      : Number(group?.conveyanceAllowanceDefault) || 0;
  const medical =
    sd?.medicalAllowance !== undefined ? Number(sd.medicalAllowance) : Number(group?.medicalAllowanceDefault) || 0;
  const other = Number(sd?.otherAllowances) || 0;
  const customAllowanceSum = (sd?.allowanceItems || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const groupAllowanceSum = (group?.defaultAllowances || []).reduce((sum, item) => {
    if (item.type === 'percentage_of_basic') return sum + moneyFromPercent(basic, item.amount);
    return sum + (Number(item.amount) || 0);
  }, 0);

  const hourlyRate = Number(employee.hourlyRate) || Number(settings?.salaryComponentRules?.defaultHourlyRate) || 0;
  const overtimeMultiplier =
    Number(group?.overtimeMultiplier) || settings?.salaryComponentRules?.overtimeRateMultiplier || 1.5;
  const overtimeHours = salaryType === 'hourly' ? Math.max(0, round2(hoursWorked - requiredHours)) : 0;
  const regularHours = salaryType === 'hourly' ? Math.min(hoursWorked, requiredHours) : 0;
  let overtimePay = salaryType === 'hourly' ? round2(hourlyRate * overtimeMultiplier * overtimeHours) : 0;

  let earningsBasic = basic;
  let allowances = round2(hra + special + conveyance + medical + other + customAllowanceSum + groupAllowanceSum);
  if (salaryType === 'hourly') {
    earningsBasic = round2(hourlyRate * regularHours);
    allowances = round2(groupAllowanceSum + customAllowanceSum);
  }

  const fullGrossBeforeIncentives = round2(earningsBasic + allowances + overtimePay);
  let grossBeforeIncentives = fullGrossBeforeIncentives;
  const calendarDayCount = Math.max(1, eachDateInclusive(period.start, period.end).length);
  const expectedHoursFromCredit = round2(Math.max(0, creditDays - holidayCreditDays) * hoursPerDay);
  const missingHours =
    salaryType === 'hourly' ? 0 : Math.max(0, round2(expectedHoursFromCredit - hoursWorked));

  let hoursShortfallAmount = 0;
  if (salaryType !== 'hourly' && missingHours > 0) {
    if (attendancePay.missingHours === 'hours_to_lop' && hoursPerDay > 0) {
      const extraLop = round2(missingHours / hoursPerDay);
      lopDays = round2(lopDays + extraLop);
      creditDays = Math.max(0, round2(creditDays - extraLop));
    } else if (attendancePay.missingHours === 'hourly_rate') {
      hoursShortfallAmount = round2(hourlyRate * missingHours);
    } else if (attendancePay.missingHours === 'gross_per_hour' && requiredHours > 0) {
      hoursShortfallAmount = round2((grossBeforeIncentives / requiredHours) * missingHours);
    }
  }

  let dayDivisor = configuredRequired;
  if (attendancePay.lopDayRate === 'gross_per_calendar_day') dayDivisor = calendarDayCount;
  const dayBase =
    attendancePay.lopDayRate === 'basic_per_working_day' ? earningsBasic : fullGrossBeforeIncentives;
  const dailyRate = dayDivisor > 0 ? dayBase / dayDivisor : 0;

  if (salaryType !== 'hourly' && serviceFraction < 1) {
    earningsBasic = round2(earningsBasic * serviceFraction);
    allowances = round2(allowances * serviceFraction);
    overtimePay = round2(overtimePay * serviceFraction);
    grossBeforeIncentives = round2(earningsBasic + allowances + overtimePay);
  }

  let skipLopDeduction = false;
  let lopAmount = round2(dailyRate * lopDays);
  if (salaryType !== 'hourly' && attendancePay.salaryMethod === 'payable_days' && requiredDays > 0) {
    const payableGross = round2(grossBeforeIncentives * Math.min(1, creditDays / requiredDays));
    lopDays = round2(Math.max(lopDays, requiredDays - creditDays));
    lopAmount = round2(grossBeforeIncentives - payableGross);
    grossBeforeIncentives = payableGross;
    skipLopDeduction = true;
  }

  const incentives = (input.incentives || []).filter(
    (item) => item.employeeId === employee.id && Number(item.amount) > 0
  );
  const incentiveTotal = round2(incentives.reduce((sum, item) => sum + (Number(item.amount) || 0), 0));
  const gross = round2(grossBeforeIncentives + incentiveTotal);

  const deductionLines: PayrollDeductionLine[] = [];
  const rules = group?.complianceRules;
  const statutory = {
    epfEmployee: 0,
    epfEmployer: 0,
    esicEmployee: 0,
    esicEmployer: 0,
    professionalTax: 0,
    tds: 0,
    gratuity: 0,
  };

  if (rules?.enableEPF) {
    const wage = rules.epfWageCeilingLimit > 0 ? Math.min(earningsBasic, rules.epfWageCeilingLimit) : earningsBasic;
    statutory.epfEmployee = moneyFromPercent(wage, rules.epfEmployeeRate);
    statutory.epfEmployer = moneyFromPercent(wage, rules.epfEmployerRate);
    if (statutory.epfEmployee) deductionLines.push({ name: 'EPF', amount: statutory.epfEmployee, source: 'statutory' });
  } else if (Number(sd?.pfDeduction)) {
    statutory.epfEmployee = round2(Number(sd?.pfDeduction));
    deductionLines.push({ name: 'EPF', amount: statutory.epfEmployee, source: 'employee' });
  }

  if (rules?.enableESIC && grossBeforeIncentives <= (rules.esicGrossWageLimit || 21000)) {
    statutory.esicEmployee = moneyFromPercent(grossBeforeIncentives, rules.esicEmployeeRate);
    statutory.esicEmployer = moneyFromPercent(grossBeforeIncentives, rules.esicEmployerRate);
    if (statutory.esicEmployee) {
      deductionLines.push({ name: 'ESIC', amount: statutory.esicEmployee, source: 'statutory' });
    }
  } else if (Number(sd?.esicDeduction)) {
    statutory.esicEmployee = round2(Number(sd?.esicDeduction));
    deductionLines.push({ name: 'ESIC', amount: statutory.esicEmployee, source: 'employee' });
  }

  if (rules?.enableProfessionalTax && Number(rules.professionalTaxAmount)) {
    statutory.professionalTax = round2(Number(rules.professionalTaxAmount));
    deductionLines.push({ name: 'Professional Tax', amount: statutory.professionalTax, source: 'statutory' });
  } else if (Number(sd?.professionalTax)) {
    statutory.professionalTax = round2(Number(sd?.professionalTax));
    deductionLines.push({ name: 'Professional Tax', amount: statutory.professionalTax, source: 'employee' });
  }

  if (rules?.enableTDS) {
    statutory.tds = moneyFromPercent(grossBeforeIncentives, 8);
    deductionLines.push({ name: 'TDS', amount: statutory.tds, source: 'statutory' });
  } else if (Number(sd?.taxDeduction)) {
    statutory.tds = round2(Number(sd?.taxDeduction));
    deductionLines.push({ name: 'TDS', amount: statutory.tds, source: 'employee' });
  }

  if (rules?.enableGratuity) {
    statutory.gratuity = moneyFromPercent(earningsBasic, rules.gratuityRate);
  }

  for (const item of group?.defaultDeductions || []) {
    const amount = item.type === 'percentage_of_basic' ? moneyFromPercent(earningsBasic, item.amount) : round2(item.amount);
    if (amount) deductionLines.push({ name: item.name, amount, source: 'group' });
  }

  for (const item of input.salaryComponents || []) {
    if (!item.isActive || item.type !== 'deduction' || item.isStatutory) continue;
    const amount =
      item.calculationType === 'percentage_of_basic'
        ? moneyFromPercent(earningsBasic, item.value)
        : item.calculationType === 'percentage_of_gross'
          ? moneyFromPercent(grossBeforeIncentives, item.value)
          : round2(item.value);
    if (amount) deductionLines.push({ name: item.name, amount, source: 'component' });
  }

  for (const item of sd?.deductionItems || []) {
    const amount = round2(Number(item.amount) || 0);
    if (amount) deductionLines.push({ name: item.name, amount, source: 'employee' });
  }

  if (!skipLopDeduction && lopAmount > 0) {
    deductionLines.push({ name: 'Loss of Pay', amount: lopAmount, source: 'lop' });
  }
  if (hoursShortfallAmount > 0) {
    deductionLines.push({ name: 'Hours shortfall', amount: hoursShortfallAmount, source: 'lop' });
  }

  const tax = round2(statutory.tds);
  const deductions = round2(deductionLines.reduce((sum, line) => sum + line.amount, 0));
  let netPay = round2(gross - deductions);
  if (!allowNegative) netPay = Math.max(0, netPay);

  return {
    id: `pay_${period.year}_${period.month}_${employee.id}`,
    employeeId: employee.id,
    employeeName: employee.name,
    department: (employee.department || 'Management') as PayrollRecord['department'],
    monthYear: period.monthYear,
    salaryType,
    payrollGroupId: group?.id,
    payrollGroupName: group?.name || 'Unassigned',
    hoursWorked: round2(hoursWorked),
    hoursRequired: requiredHours,
    daysWorked: round2(creditDays),
    daysRequired: requiredDays,
    hoursMet,
    lopDays,
    lopAmount,
    hourlyRate: salaryType === 'hourly' ? hourlyRate : undefined,
    overtimeHours,
    basicSalary: round2(earningsBasic),
    allowances,
    overtimePay,
    incentives: incentiveTotal,
    incentiveItems: incentives,
    deductions,
    deductionLines,
    tax,
    netPay,
    netSalary: netPay,
    statutoryBreakdown: statutory,
    status: 'Draft',
  };
}

export function buildPayrollRun(input: PayrollRunInput): {
  period: PayrollPeriod;
  lines: PayrollRecord[];
  totals: PayrollCompanyTotals;
} {
  const period = getPayrollPeriod(input.year, input.month, input.settings, input.periodSlice);
  const lines = (input.employees || [])
    .filter(isActiveEmployee)
    .map((employee) => computeLine(employee, period, input))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const totals: PayrollCompanyTotals = {
    employeeCount: lines.length,
    totalGross: round2(lines.reduce((sum, line) => sum + line.basicSalary + line.allowances + line.overtimePay, 0)),
    totalIncentives: round2(lines.reduce((sum, line) => sum + (line.incentives || 0), 0)),
    totalLop: round2(lines.reduce((sum, line) => sum + (line.lopAmount || 0), 0)),
    totalDeductions: round2(lines.reduce((sum, line) => sum + line.deductions, 0)),
    totalNet: round2(lines.reduce((sum, line) => sum + line.netPay, 0)),
    shortHoursCount: lines.filter((line) => !line.hoursMet).length,
    disbursementDay: period.disbursementDay,
    periodLabel: period.monthYear,
  };

  return { period, lines, totals };
}

export const PAYROLL_DRAFT_KEY = 'payroll-run-draft';

export function loadPayrollDraft(): PayrollRunDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PAYROLL_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PayrollRunDraft;
    if (!parsed?.month || !parsed?.year) return null;
    return {
      month: Number(parsed.month),
      year: Number(parsed.year),
      incentives: Array.isArray(parsed.incentives) ? parsed.incentives : [],
    };
  } catch {
    return null;
  }
}

export function savePayrollDraft(draft: PayrollRunDraft) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(PAYROLL_DRAFT_KEY, JSON.stringify(draft));
}
