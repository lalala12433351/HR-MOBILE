export type AttendanceReportId =
  | 'attendance_master'
  | 'shift_wise'
  | 'daily_punch'
  | 'working_hours'
  | 'muster_report'
  | 'leave_taken'
  | 'day_wise_master';

export type OverviewWidgetId =
  | 'headcount'
  | 'projects'
  | 'tasks'
  | 'attendance_snapshot';

export const ATTENDANCE_REPORT_CATALOG: {
  id: AttendanceReportId;
  name: string;
  desc: string;
}[] = [
  { id: 'attendance_master', name: 'Attendance Master', desc: 'Staff punch statistics, attendance rate and monthly presence' },
  { id: 'shift_wise', name: 'Shift Wise Report', desc: 'Shift compliance, roster assignments and grace tracking' },
  { id: 'daily_punch', name: 'Daily Punch Report', desc: 'Daily in/out timeline, device methods and geofence verification' },
  { id: 'working_hours', name: 'Working Hours Report', desc: 'Logged hours, expected hours, overtime and deficit calculations' },
  { id: 'muster_report', name: 'Muster Report', desc: 'Monthly payroll presence muster, leave ratios and payable days' },
  { id: 'leave_taken', name: 'Leave Taken Report', desc: 'Approved and pending leave applications with category distribution' },
  { id: 'day_wise_master', name: 'Employee Day Wise Master', desc: 'Individual staff daily breakdown and log analysis' },
];

export const OVERVIEW_WIDGET_CATALOG: {
  id: OverviewWidgetId;
  name: string;
  desc: string;
}[] = [
  { id: 'headcount', name: 'Headcount by Department', desc: 'Active staff distribution across departments' },
  { id: 'projects', name: 'Active Projects', desc: 'Project count and status breakdown' },
  { id: 'tasks', name: 'Task Completion Velocity', desc: 'Completed vs open tasks from live project data' },
  { id: 'attendance_snapshot', name: 'Attendance Snapshot', desc: 'Month attendance rate, late days and leave count' },
];

export const REPORT_FIELD_CATALOG: Record<
  AttendanceReportId,
  { key: string; label: string }[]
> = {
  attendance_master: [
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'name', label: 'Staff Name' },
    { key: 'department', label: 'Department' },
    { key: 'branch', label: 'Branch / Office' },
    { key: 'scheduledDays', label: 'Scheduled Days' },
    { key: 'presentDays', label: 'Present Days' },
    { key: 'lateDays', label: 'Late Logins' },
    { key: 'leaveDays', label: 'Leaves' },
    { key: 'rate', label: 'Attendance Rate' },
  ],
  shift_wise: [
    { key: 'shift', label: 'Shift Name' },
    { key: 'assigned', label: 'Assigned Staff' },
    { key: 'compliance', label: 'Compliance Rate' },
    { key: 'actions', label: 'Action Status' },
  ],
  daily_punch: [
    { key: 'date', label: 'Date' },
    { key: 'employee', label: 'Staff Name' },
    { key: 'checkIn', label: 'Clock In' },
    { key: 'checkOut', label: 'Clock Out' },
    { key: 'workingHours', label: 'Hours Logged' },
    { key: 'status', label: 'Status' },
    { key: 'location', label: 'Location' },
  ],
  working_hours: [
    { key: 'employee', label: 'Staff Name' },
    { key: 'department', label: 'Department' },
    { key: 'expected', label: 'Expected Hours' },
    { key: 'logged', label: 'Logged Hours' },
    { key: 'overtime', label: 'Overtime' },
    { key: 'deficit', label: 'Deficit' },
    { key: 'status', label: 'Status' },
  ],
  muster_report: [
    { key: 'employee', label: 'Staff Name' },
    { key: 'department', label: 'Department' },
    { key: 'presentDays', label: 'Present Days' },
    { key: 'leaveDays', label: 'Leaves' },
    { key: 'payableDays', label: 'Payable Days' },
    { key: 'attendanceHealth', label: 'Attendance Health' },
  ],
  leave_taken: [
    { key: 'employee', label: 'Staff Name' },
    { key: 'leaveType', label: 'Leave Type' },
    { key: 'duration', label: 'Duration Period' },
    { key: 'days', label: 'Days Count' },
    { key: 'status', label: 'Status' },
    { key: 'reason', label: 'Reason' },
  ],
  day_wise_master: [
    { key: 'date', label: 'Date' },
    { key: 'checkIn', label: 'Clock In' },
    { key: 'checkOut', label: 'Clock Out' },
    { key: 'hours', label: 'Logged Hours' },
    { key: 'status', label: 'Attendance Status' },
  ],
};

export const DEFAULT_VISIBLE_FIELDS: Record<string, string[]> = Object.fromEntries(
  Object.entries(REPORT_FIELD_CATALOG).map(([id, fields]) => [id, fields.map((f) => f.key)])
);

export const DEFAULT_ENABLED_REPORTS: AttendanceReportId[] = ATTENDANCE_REPORT_CATALOG.map((r) => r.id);

export const DEFAULT_OVERVIEW_WIDGETS: OverviewWidgetId[] = OVERVIEW_WIDGET_CATALOG.map((w) => w.id);

export function getDefaultReportSettings() {
  return {
    enabledReports: [...DEFAULT_ENABLED_REPORTS],
    enabledOverviewWidgets: [...DEFAULT_OVERVIEW_WIDGETS],
    showCharts: true,
    showKpiCards: true,
    visibleFields: { ...DEFAULT_VISIBLE_FIELDS },
    defaultTab: 'overview' as const,
    defaultReport: 'attendance_master' as AttendanceReportId,
    rowsPerPage: 25,
    expectedHoursPerDay: 8,
    showDepartmentFilter: true,
    showBranchFilter: true,
    showShiftFilter: true,
    allowCsvExport: true,
    csvIncludeGeofence: true,
    defaultMonthOffset: 0 as 0 | -1,
  };
}
