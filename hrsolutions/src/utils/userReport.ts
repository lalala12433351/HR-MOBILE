import {
  AttendanceRecord,
  Employee,
  LeaveRequest,
  PayrollRecord,
  Task,
  TimesheetEntry,
} from '@/types';
import { isPaidLeaveType } from '@/utils/leaveRules';

export type UserReportRange = { start: string; end: string };

export type UserReportAttendanceRow = {
  date: string;
  checkIn: string;
  checkOut: string;
  hours: number;
  status: string;
};

export type UserReportTaskRow = {
  id: string;
  title: string;
  project: string;
  status: string;
  dueDate: string;
  estimatedHours: number;
  actualHours: number;
  overdue: boolean;
};

export type UserReportLeaveRow = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  paid: boolean;
};

export type UserReport = {
  employeeId: string;
  name: string;
  employeeCode: string;
  department: string;
  designation: string;
  email: string;
  payrollGroup: string;
  salaryType: string;
  range: UserReportRange;
  presentDays: number;
  lateDays: number;
  wfhDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  attendanceHours: number;
  timesheetHours: number;
  taskHours: number;
  hoursWorked: number;
  hoursRequired: number;
  daysWorked: number;
  daysRequired: number;
  lopDays: number;
  lopAmount: number;
  leaveBalances: Array<{ label: string; remaining: number }>;
  attendance: UserReportAttendanceRow[];
  tasks: UserReportTaskRow[];
  completedTasks: number;
  overdueTasks: number;
  leaves: UserReportLeaveRow[];
  payroll: {
    available: boolean;
    gross: number;
    incentives: number;
    deductions: number;
    net: number;
    hoursMet: boolean;
    deductionLines: Array<{ name: string; amount: number }>;
    incentiveItems: Array<{ type: string; amount: number; reason: string }>;
  };
};

const dateOnly = (value?: string) => String(value || '').slice(0, 10);

const inRange = (value: string | undefined, start: string, end: string) => {
  const current = dateOnly(value);
  return Boolean(current && current >= start && current <= end);
};

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const todayKey = () => dateOnly(new Date().toISOString());

function leaveOverlapsRange(leave: LeaveRequest, start: string, end: string) {
  const from = dateOnly(leave.startDate);
  const to = dateOnly(leave.endDate);
  if (!from || !to) return false;
  return from <= end && to >= start;
}

function taskBelongsTo(task: Task, employeeId: string) {
  if (task.assigneeId === employeeId) return true;
  return (task.assigneeIds || []).includes(employeeId);
}

function taskHours(task: Task) {
  if (Number(task.actualHours) > 0) return Number(task.actualHours);
  if (Number(task.timeSpentSeconds) > 0) return Number(task.timeSpentSeconds) / 3600;
  return 0;
}

function estimateFallbackLop(args: {
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
}) {
  const absent = args.attendance.filter((row) => row.status === 'Absent').length;
  const half = args.attendance.filter((row) => row.status === 'Half Day').length * 0.5;
  const unpaidLeave = args.leaves
    .filter((leave) => leave.status === 'Approved' && !isPaidLeaveType(leave.leaveType, leave.isPaid))
    .reduce((sum, leave) => sum + (Number(leave.daysCount) || 0), 0);
  return round2(absent + half + unpaidLeave);
}

export function buildUserReport(args: {
  employee: Employee;
  range: UserReportRange;
  attendance?: AttendanceRecord[];
  leaves?: LeaveRequest[];
  tasks?: Task[];
  timesheets?: TimesheetEntry[];
  payrollLine?: PayrollRecord | null;
}): UserReport {
  const { employee, range, payrollLine } = args;
  const attendance = (args.attendance || []).filter(
    (row) => row.employeeId === employee.id && inRange(row.date, range.start, range.end)
  );
  const leaves = (args.leaves || []).filter(
    (row) => row.employeeId === employee.id && leaveOverlapsRange(row, range.start, range.end)
  );
  const tasks = (args.tasks || []).filter((task) => taskBelongsTo(task, employee.id));
  const timesheets = (args.timesheets || []).filter(
    (row) => row.employeeId === employee.id && inRange(row.date, range.start, range.end)
  );

  const presentDays = new Set(
    attendance
      .filter((row) => ['Present', 'Late', 'Work From Home'].includes(row.status))
      .map((row) => dateOnly(row.date))
  ).size;
  const lateDays = attendance.filter((row) => row.status === 'Late').length;
  const wfhDays = attendance.filter((row) => row.status === 'Work From Home').length;
  const halfDays = attendance.filter((row) => row.status === 'Half Day').length;
  const absentDays = attendance.filter((row) => row.status === 'Absent').length;
  const leaveDays = leaves
    .filter((leave) => leave.status === 'Approved')
    .reduce((sum, leave) => sum + (Number(leave.daysCount) || 0), 0);
  const attendanceHours = round2(attendance.reduce((sum, row) => sum + (Number(row.workingHours) || 0), 0));
  const timesheetHours = round2(timesheets.reduce((sum, row) => sum + (Number(row.hours) || 0), 0));
  const taskRows: UserReportTaskRow[] = tasks.map((task) => {
    const due = dateOnly(task.dueDate);
    const closed = ['Completed', 'Approved'].includes(task.status);
    return {
      id: task.id,
      title: task.title,
      project: task.projectName || 'Unassigned',
      status: task.status,
      dueDate: due || 'No date',
      estimatedHours: Number(task.estimatedHours) || 0,
      actualHours: round2(taskHours(task)),
      overdue: Boolean(due && due < todayKey() && !closed),
    };
  });
  const taskHoursTotal = round2(taskRows.reduce((sum, row) => sum + row.actualHours, 0));
  const hoursWorked = round2(
    Number(payrollLine?.hoursWorked) || Math.max(attendanceHours, timesheetHours, taskHoursTotal)
  );

  const balances = employee.leaveBalances;
  const leaveBalances = [
    { label: 'Casual leave', remaining: Number(balances?.casualLeave) || 0 },
    { label: 'Sick leave', remaining: Number(balances?.sickLeave) || 0 },
    { label: 'Earned leave', remaining: Number(balances?.earnedLeave) || 0 },
    { label: 'Comp off', remaining: Number(balances?.compOff) || 0 },
  ];

  return {
    employeeId: employee.id,
    name: employee.name || employee.fullName || 'Employee',
    employeeCode: employee.employeeId || '',
    department: String(employee.department || ''),
    designation: employee.designation || '',
    email: employee.email || '',
    payrollGroup: payrollLine?.payrollGroupName || '',
    salaryType: String(payrollLine?.salaryType || employee.salaryType || ''),
    range,
    presentDays,
    lateDays,
    wfhDays,
    halfDays,
    absentDays,
    leaveDays: round2(leaveDays),
    attendanceHours,
    timesheetHours,
    taskHours: taskHoursTotal,
    hoursWorked,
    hoursRequired: Number(payrollLine?.hoursRequired) || 0,
    daysWorked: Number(payrollLine?.daysWorked) || presentDays + halfDays * 0.5,
    daysRequired: Number(payrollLine?.daysRequired) || 0,
    lopDays: Number(payrollLine?.lopDays) || estimateFallbackLop({ attendance, leaves }),
    lopAmount: Number(payrollLine?.lopAmount) || 0,
    leaveBalances,
    attendance: attendance
      .slice()
      .sort((a, b) => dateOnly(a.date).localeCompare(dateOnly(b.date)))
      .map((row) => ({
        date: dateOnly(row.date),
        checkIn: row.checkIn || '—',
        checkOut: row.checkOut || '—',
        hours: Number(row.workingHours) || 0,
        status: row.status,
      })),
    tasks: taskRows,
    completedTasks: taskRows.filter((row) => ['Completed', 'Approved'].includes(row.status)).length,
    overdueTasks: taskRows.filter((row) => row.overdue).length,
    leaves: leaves.map((leave) => ({
      id: leave.id,
      type: leave.leaveType,
      startDate: dateOnly(leave.startDate),
      endDate: dateOnly(leave.endDate),
      days: Number(leave.daysCount) || 0,
      status: leave.status,
      paid: isPaidLeaveType(leave.leaveType, leave.isPaid),
    })),
    payroll: {
      available: Boolean(payrollLine),
      gross: payrollLine ? round2(payrollLine.basicSalary + payrollLine.allowances + payrollLine.overtimePay) : 0,
      incentives: Number(payrollLine?.incentives) || 0,
      deductions: Number(payrollLine?.deductions) || 0,
      net: Number(payrollLine?.netPay) || 0,
      hoursMet: Boolean(payrollLine?.hoursMet),
      deductionLines: (payrollLine?.deductionLines || []).map((item) => ({
        name: item.name,
        amount: Number(item.amount) || 0,
      })),
      incentiveItems: (payrollLine?.incentiveItems || []).map((item) => ({
        type: item.type,
        amount: Number(item.amount) || 0,
        reason: item.reason,
      })),
    },
  };
}

export function monthRange(year: number, month: number): UserReportRange {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const key = (value: Date) =>
    `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return { start: key(start), end: key(end) };
}
