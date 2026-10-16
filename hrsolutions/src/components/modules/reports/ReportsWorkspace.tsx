'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AppState } from '@/services/store';
import { getDefaultReportSettings } from '@/utils/reportCatalog';
import { isAdminPersona, isHRPersona, getTeamEmployees } from '@/utils/teamAccess';
import { api } from '@/services/apiClient';
import { UserReportView } from './UserReportView';
import { buildUserReport } from '@/utils/userReport';
import { downloadUserReportPdf, downloadUserReportXlsx } from '@/utils/userReportExport';
import { buildPayrollRun } from '@/utils/payrollRun';

type ReportId = 'overview' | 'workforce' | 'attendance' | 'compliance' | 'leave' | 'payroll' | 'delivery' | 'user';
type Period = 'current' | 'previous' | 'quarter' | 'ytd' | 'custom';

type ServerSummary = {
  workforce: { activeHeadcount: number };
  attendance: { attendanceRate: number; lateArrivals: number };
  leave: { approvedDays: number; pendingRequests: number };
  compliance: { pendingRegularizations: number };
  delivery: { totalTasks: number; completedTasks: number; overdueTasks: number };
};

const REPORTS: Array<{ id: ReportId; label: string }> = [
  { id: 'overview', label: 'Executive overview' },
  { id: 'workforce', label: 'Workforce' },
  { id: 'attendance', label: 'Attendance & punctuality' },
  { id: 'compliance', label: 'Time & compliance' },
  { id: 'leave', label: 'Leave & availability' },
  { id: 'payroll', label: 'Payroll readiness' },
  { id: 'delivery', label: 'Work delivery' },
  { id: 'user', label: 'User Report' },
];

const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const dateOnly = (value?: string) => String(value || '').slice(0, 10);
const number = (value: number) => new Intl.NumberFormat().format(Math.round(value));
const percentage = (value: number) => `${Math.round(value * 10) / 10}%`;

function rangeFor(period: Period, customStart: string, customEnd: string) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (period === 'previous') {
    start.setMonth(start.getMonth() - 1);
    end.setMonth(end.getMonth() - 1);
  }
  if (period === 'quarter') {
    start.setMonth(Math.floor(today.getMonth() / 3) * 3, 1);
  }
  if (period === 'ytd') {
    start.setMonth(0, 1);
    end.setTime(today.getTime());
  }
  if (period === 'custom' && customStart && customEnd) return { start: customStart, end: customEnd };
  return { start: dateKey(start), end: dateKey(end) };
}

function previousRange(start: string, end: string) {
  const first = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  const days = Math.max(1, Math.round((last.getTime() - first.getTime()) / 86_400_000) + 1);
  const previousEnd = new Date(first);
  previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousStart.getDate() - days + 1);
  return { start: dateKey(previousStart), end: dateKey(previousEnd) };
}

function inRange(value: string | undefined, start: string, end: string) {
  const current = dateOnly(value);
  return Boolean(current && current >= start && current <= end);
}

function workDays(start: string, end: string) {
  let total = 0;
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    if (cursor.getDay() !== 0 && cursor.getDay() !== 6) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, total);
}

function StatCard({ label, value, comparison }: { label: string; value: string; comparison: string; accent?: string }) {
  return (
    <div className="people-studio__sheet people-studio__kpi">
      <p className="people-studio__kpi-label">{label}</p>
      <p className="people-studio__kpi-value">{value}</p>
      <p className="people-studio__kpi-note">{comparison}</p>
    </div>
  );
}

function Section({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`people-studio__sheet people-studio__dept ${className}`}>
      <div className="people-studio__dept-head">
        <h2 className="people-studio__dept-name">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="people-studio__empty">{children}</div>;
}

type PdfTable = { title: string; headers: string[]; rows: Array<Array<string | number>> };

const PDF_WIDTH = 842;
const PDF_HEIGHT = 596;
const PDF_MARGIN = 36;

function pdfText(value: string | number) {
  return String(value).normalize('NFKD').replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function pdfColor([red, green, blue]: number[], operator: 'rg' | 'RG') {
  return `${(red / 255).toFixed(3)} ${(green / 255).toFixed(3)} ${(blue / 255).toFixed(3)} ${operator}`;
}

function pdfLines(value: string | number, maxWidth: number, fontSize: number) {
  const characters = Math.max(8, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = pdfText(value).split(/\s+/);
  const lines: string[] = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= characters) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word.length > characters ? `${word.slice(0, Math.max(1, characters - 1))}-` : word;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function downloadReportPdf({ organizationName, reportName, range, department, metrics, table }: {
  organizationName: string;
  reportName: string;
  range: { start: string; end: string };
  department: string;
  metrics: Array<{ label: string; value: string; comparison: string; accent: string }>;
  table: PdfTable;
}) {
  const pages: string[][] = [];
  let commands: string[] = [];
  const topY = (top: number) => PDF_HEIGHT - top;
  const fillRect = (x: number, top: number, width: number, height: number, color: number[]) => commands.push(`q ${pdfColor(color, 'rg')} ${x} ${topY(top + height)} ${width} ${height} re f Q`);
  const strokeRect = (x: number, top: number, width: number, height: number, color: number[]) => commands.push(`q ${pdfColor(color, 'RG')} 0.7 w ${x} ${topY(top + height)} ${width} ${height} re S Q`);
  const line = (x1: number, top1: number, x2: number, top2: number, color: number[]) => commands.push(`q ${pdfColor(color, 'RG')} 0.5 w ${x1} ${topY(top1)} m ${x2} ${topY(top2)} l S Q`);
  const text = (value: string | number, x: number, top: number, size: number, bold = false, color = [30, 41, 59]) => commands.push(`BT /F${bold ? 2 : 1} ${size} Tf ${pdfColor(color, 'rg')} 1 0 0 1 ${x} ${topY(top)} Tm (${pdfText(value)}) Tj ET`);
  const rightText = (value: string, top: number, size: number, color = [100, 116, 139]) => text(value, PDF_WIDTH - PDF_MARGIN - value.length * size * 0.51, top, size, false, color);
  const hexToRgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const generatedAt = new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());

  const drawHeader = () => {
    fillRect(0, 0, PDF_WIDTH, 58, [15, 23, 42]);
    text(organizationName.toUpperCase(), PDF_MARGIN, 24, 10, true, [226, 232, 240]);
    text(reportName, PDF_MARGIN, 45, 17, true, [255, 255, 255]);
    rightText(`${range.start} to ${range.end} | ${department}`, 42, 9, [226, 232, 240]);
  };

  const drawTableHeader = (top: number, columnWidth: number) => {
    fillRect(PDF_MARGIN, top, PDF_WIDTH - PDF_MARGIN * 2, 22, [241, 245, 249]);
    let x = PDF_MARGIN;
    table.headers.forEach((header) => {
      text(header, x + 6, top + 14, 8, true, [71, 85, 105]);
      x += columnWidth;
    });
    return top + 22;
  };

  drawHeader();
  const cardGap = 8;
  const cardWidth = (PDF_WIDTH - PDF_MARGIN * 2 - cardGap * 3) / 4;
  metrics.forEach((metric, index) => {
    const x = PDF_MARGIN + index * (cardWidth + cardGap);
    fillRect(x, 76, cardWidth, 58, [255, 255, 255]);
    strokeRect(x, 76, cardWidth, 58, [203, 213, 225]);
    fillRect(x, 76, cardWidth, 3, hexToRgb(metric.accent));
    text(metric.label.toUpperCase(), x + 9, 94, 7, true, [100, 116, 139]);
    text(metric.value, x + 9, 113, 16, true, [15, 23, 42]);
    text(metric.comparison, x + 9, 126, 7.5, false, [71, 85, 105]);
  });
  text(table.title, PDF_MARGIN, 159, 10, true, [15, 23, 42]);
  rightText(`${table.rows.length} records | Generated ${generatedAt}`, 159, 8);

  const columnWidth = (PDF_WIDTH - PDF_MARGIN * 2) / table.headers.length;
  let top = drawTableHeader(170, columnWidth);
  table.rows.forEach((row, index) => {
    const lineSets = row.map((cell) => pdfLines(cell, columnWidth - 12, 8));
    const rowHeight = Math.max(22, Math.max(...lineSets.map((lines) => lines.length)) * 10 + 10);
    if (top + rowHeight > PDF_HEIGHT - 52) {
      pages.push(commands);
      commands = [];
      drawHeader();
      top = drawTableHeader(78, columnWidth);
    }
    if (index % 2 === 1) fillRect(PDF_MARGIN, top, PDF_WIDTH - PDF_MARGIN * 2, rowHeight, [248, 250, 252]);
    line(PDF_MARGIN, top + rowHeight, PDF_WIDTH - PDF_MARGIN, top + rowHeight, [226, 232, 240]);
    let x = PDF_MARGIN;
    lineSets.forEach((lines) => {
      lines.forEach((value, lineIndex) => text(value, x + 6, top + 14 + lineIndex * 10, 8));
      x += columnWidth;
    });
    top += rowHeight;
  });
  if (!table.rows.length) text('No records match the selected scope.', PDF_MARGIN + 6, top + 18, 9, false, [100, 116, 139]);
  pages.push(commands);

  const pageStreams = pages.map((page, index) => {
    const footer = [
      `q ${pdfColor([203, 213, 225], 'RG')} 0.5 w ${PDF_MARGIN} ${topY(PDF_HEIGHT - 32)} m ${PDF_WIDTH - PDF_MARGIN} ${topY(PDF_HEIGHT - 32)} l S Q`,
      `BT /F1 7.5 Tf ${pdfColor([100, 116, 139], 'rg')} 1 0 0 1 ${PDF_MARGIN} 20 Tm (Confidential internal report) Tj ET`,
      `BT /F1 7.5 Tf ${pdfColor([100, 116, 139], 'rg')} 1 0 0 1 ${PDF_WIDTH - PDF_MARGIN - 44} 20 Tm (Page ${index + 1} of ${pages.length}) Tj ET`,
    ];
    return [...page, ...footer].join('\n');
  });
  const pageObjectIds = pageStreams.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageStreams.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  pageStreams.forEach((stream, index) => {
    const pageObjectId = 5 + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_WIDTH} ${PDF_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let pdf = '%PDF-1.4\n%PDF Report\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${reportName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${range.start}_${range.end}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ReportsWorkspace({ state }: { state: AppState }) {
  const settings = { ...getDefaultReportSettings(), ...(state.customOptions?.reportSettings || {}) };
  const [report, setReport] = useState<ReportId>('overview');
  const [period, setPeriod] = useState<Period>('current');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [department, setDepartment] = useState('All');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [serverSummary, setServerSummary] = useState<ServerSummary | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const range = rangeFor(period, customStart, customEnd);
  const previous = previousRange(range.start, range.end);
  const isExecutive = isAdminPersona(state.currentPersona) || isHRPersona(state.currentPersona);
  const isInstitute = String(state.organization?.industry || '').toLowerCase().includes('institute');

  useEffect(() => {
    let current = true;
    if (department !== 'All') {
      setServerSummary(null);
      return () => { current = false; };
    }
    void api.reports.getSummary({ startDate: range.start, endDate: range.end })
      .then((response: any) => {
        if (current && response?.success && response.data) setServerSummary(response.data as ServerSummary);
      })
      .catch(() => {
        if (current) setServerSummary(null);
      });
    return () => { current = false; };
  }, [department, range.end, range.start]);

  const employees = useMemo(() => {
    const source = isExecutive ? state.employees || [] : getTeamEmployees(state.currentPersona, state.employees || []);
    return source.filter((employee: any) => employee.status !== 'Deactivated' && (department === 'All' || employee.department === department));
  }, [department, isExecutive, state.currentPersona, state.employees]);
  const employeeIds = useMemo(() => new Set(employees.map((employee: any) => employee.id)), [employees]);
  const departments = useMemo<string[]>(() => ['All', ...Array.from(new Set<string>((state.employees || []).map((employee: any) => String(employee.department || '')).filter(Boolean))).sort()], [state.employees]);
  const scopedAttendance = useMemo(() => (state.attendance || []).filter((item: any) => employeeIds.has(item.employeeId) && inRange(item.date, range.start, range.end)), [state.attendance, employeeIds, range.end, range.start]);
  const priorAttendance = useMemo(() => (state.attendance || []).filter((item: any) => employeeIds.has(item.employeeId) && inRange(item.date, previous.start, previous.end)), [state.attendance, employeeIds, previous.end, previous.start]);
  const scopedLeaves = useMemo(() => (state.leaves || []).filter((item: any) => employeeIds.has(item.employeeId) && (inRange(item.startDate, range.start, range.end) || inRange(item.endDate, range.start, range.end))), [state.leaves, employeeIds, range.end, range.start]);
  const scopedRegularizations = useMemo(() => (state.regularizations || []).filter((item: any) => employeeIds.has(item.employeeId) && inRange(item.date, range.start, range.end)), [state.regularizations, employeeIds, range.end, range.start]);
  const tasks = useMemo(() => (state.tasks || []).filter((task: any) => isExecutive || employeeIds.has(task.assigneeId)), [state.tasks, isExecutive, employeeIds]);
  const projects = state.projects || [];

  const attendanceMetrics = useMemo(() => {
    const present = new Set(scopedAttendance.filter((item: any) => ['Present', 'Late', 'Work From Home'].includes(item.status)).map((item: any) => `${item.employeeId}:${dateOnly(item.date)}`)).size;
    const late = scopedAttendance.filter((item: any) => item.status === 'Late').length;
    const expected = employees.length * workDays(range.start, range.end);
    const rate = expected ? Math.min(100, (present / expected) * 100) : 0;
    const priorPresent = new Set(priorAttendance.filter((item: any) => ['Present', 'Late', 'Work From Home'].includes(item.status)).map((item: any) => `${item.employeeId}:${dateOnly(item.date)}`)).size;
    const priorExpected = employees.length * workDays(previous.start, previous.end);
    const priorRate = priorExpected ? Math.min(100, (priorPresent / priorExpected) * 100) : 0;
    return { present, late, expected, rate, priorRate, hours: scopedAttendance.reduce((sum: number, item: any) => sum + (Number(item.workingHours) || 0), 0) };
  }, [employees.length, previous.end, previous.start, priorAttendance, range.end, range.start, scopedAttendance]);

  const leaveDays = scopedLeaves.filter((item: any) => item.status === 'Approved').reduce((sum: number, item: any) => sum + (Number(item.daysCount) || 0), 0);
  const completedTasks = tasks.filter((task: any) => ['Completed', 'Approved'].includes(task.status)).length;
  const taskRate = tasks.length ? (completedTasks / tasks.length) * 100 : 0;
  const overdueTasks = tasks.filter((task: any) => task.dueDate && task.dueDate < dateKey(new Date()) && !['Completed', 'Approved'].includes(task.status));
  const pendingLeaves = scopedLeaves.filter((item: any) => item.status === 'Pending');
  const pendingRegularizations = scopedRegularizations.filter((item: any) => item.status === 'Pending');

  const trend = useMemo(() => {
    const days = Math.min(7, Math.max(1, Math.round((new Date(`${range.end}T00:00:00`).getTime() - new Date(`${range.start}T00:00:00`).getTime()) / 86_400_000) + 1));
    return Array.from({ length: days }, (_, index) => {
      const day = new Date(`${range.end}T00:00:00`);
      day.setDate(day.getDate() - (days - index - 1));
      const key = dateKey(day);
      const present = scopedAttendance.filter((item: any) => dateOnly(item.date) === key && ['Present', 'Late', 'Work From Home'].includes(item.status)).length;
      return { day: key.slice(5), present };
    });
  }, [range.end, range.start, scopedAttendance]);

  const employeeRows = useMemo(() => employees.map((employee: any) => {
    const records = scopedAttendance.filter((item: any) => item.employeeId === employee.id);
    const present = new Set(records.filter((item: any) => ['Present', 'Late', 'Work From Home'].includes(item.status)).map((item: any) => dateOnly(item.date))).size;
    const late = records.filter((item: any) => item.status === 'Late').length;
    const hours = records.reduce((sum: number, item: any) => sum + (Number(item.workingHours) || 0), 0);
    const leaves = scopedLeaves.filter((item: any) => item.employeeId === employee.id && item.status === 'Approved').reduce((sum: number, item: any) => sum + (Number(item.daysCount) || 0), 0);
    return { employee, present, late, hours, leaves, rate: workDays(range.start, range.end) ? (present / workDays(range.start, range.end)) * 100 : 0 };
  }).filter((item: any) => !query || `${item.employee.name} ${item.employee.employeeId} ${item.employee.department}`.toLowerCase().includes(query.toLowerCase())), [employees, query, range.end, range.start, scopedAttendance, scopedLeaves]);

  const pageTitle = REPORTS.find((item) => item.id === report)?.label || 'Reports';
  const selectedUser = employees.find((employee: any) => employee.id === selectedUserId) || null;
  const userPayrollLine = useMemo(() => {
    if (!selectedUser) return null;
    const start = new Date(`${range.start}T00:00:00`);
    return (
      buildPayrollRun({
        employees: [selectedUser],
        attendance: state.attendance || [],
        leaves: state.leaves || [],
        timesheets: state.timesheets || [],
        groups: state.customOptions?.payrollGroups || [],
        settings: state.customOptions?.payrollSettings,
        salaryComponents: state.customOptions?.salaryComponents || [],
        fullDayMinimumHours: state.customOptions?.attendanceSettings?.fullDayMinimumHours,
        year: start.getFullYear(),
        month: start.getMonth() + 1,
      }).lines[0] || null
    );
  }, [range.start, selectedUser, state.attendance, state.customOptions, state.leaves, state.timesheets]);
  const userReport = useMemo(
    () =>
      selectedUser
        ? buildUserReport({
            employee: selectedUser,
            range,
            attendance: state.attendance || [],
            leaves: state.leaves || [],
            tasks: state.tasks || [],
            timesheets: state.timesheets || [],
            payrollLine: userPayrollLine,
          })
        : null,
    [range, selectedUser, state.attendance, state.leaves, state.tasks, state.timesheets, userPayrollLine]
  );
  const exportTable = useMemo(() => {
    if (report === 'user') {
      return { title: 'User Report', headers: ['Employee'], rows: [] as Array<Array<string | number>> };
    }
    if (report === 'delivery') {
      return {
        title: 'Work delivery',
        headers: ['Task', 'Project', 'Assignee', 'Due date', 'Status'],
        rows: tasks.map((task: any) => [task.title, task.projectName || 'Unassigned', task.assigneeName || 'Unassigned', task.dueDate || 'No date', task.status]),
      };
    }

    const rows = employeeRows.map((item: any) => {
      const base = [item.employee.name, item.employee.department];
      if (report === 'leave') return [...base, item.leaves, percentage(item.rate)];
      if (report === 'compliance') return [...base, item.hours.toFixed(1), item.late, item.hours >= item.present * 8 ? 'On target' : 'Review'];
      if (report === 'payroll') return [...base, item.present, item.leaves, Math.max(0, item.present - item.leaves)];
      if (report === 'workforce') return [...base, item.present, item.leaves, percentage(item.rate)];
      return [...base, item.present, item.late, percentage(item.rate)];
    });
    const configs: Record<Exclude<ReportId, 'delivery' | 'user'>, string[]> = {
      overview: ['Employee', 'Department', 'Present days', 'Late', 'Attendance rate'],
      workforce: ['Employee', 'Department', 'Present days', 'Leave days', 'Attendance rate'],
      attendance: ['Employee', 'Department', 'Present days', 'Late', 'Attendance rate'],
      compliance: ['Employee', 'Department', 'Hours', 'Late', 'Status'],
      leave: ['Employee', 'Department', 'Leave days', 'Attendance rate'],
      payroll: ['Employee', 'Department', 'Present days', 'Leave days', 'Payable days'],
    };
    return { title: report === 'overview' ? 'Attendance exceptions' : pageTitle, headers: configs[report], rows };
  }, [employeeRows, pageTitle, report, tasks]);

  const exportCsv = () => {
    const csv = [exportTable.headers, ...exportTable.rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report}_${range.start}_${range.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const compactMetrics = [
    { label: isInstitute ? 'Active students' : 'Active headcount', value: number(serverSummary?.workforce.activeHeadcount ?? employees.length), comparison: `${departments.length - 1} departments`, accent: '#17324e' },
    { label: 'Attendance rate', value: percentage(serverSummary?.attendance.attendanceRate ?? attendanceMetrics.rate), comparison: `${attendanceMetrics.rate >= attendanceMetrics.priorRate ? '+' : ''}${(attendanceMetrics.rate - attendanceMetrics.priorRate).toFixed(1)} pts`, accent: '#53886b' },
    { label: 'Approved leave', value: number(serverSummary?.leave.approvedDays ?? leaveDays), comparison: `${serverSummary?.leave.pendingRequests ?? pendingLeaves.length} pending`, accent: '#17324e' },
    { label: 'Task completion', value: percentage(serverSummary?.delivery.totalTasks ? (serverSummary.delivery.completedTasks / serverSummary.delivery.totalTasks) * 100 : taskRate), comparison: `${serverSummary?.delivery.overdueTasks ?? overdueTasks.length} overdue`, accent: '#53886b' },
  ];

  const exportPdf = async () => {
    setIsExportingPdf(true);
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (report === 'user' && userReport) {
        downloadUserReportPdf(userReport, String(state.organization?.name || 'Pixbe'));
      } else {
        downloadReportPdf({
          organizationName: String(state.organization?.name || 'Pixbe'),
          reportName: pageTitle,
          range,
          department,
          metrics: compactMetrics,
          table: exportTable,
        });
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const tableTitle: Record<Exclude<ReportId, 'overview' | 'user'>, string> = {
    workforce: isInstitute ? 'Student register' : 'Employee register',
    attendance: 'Attendance exceptions',
    compliance: 'Working time',
    leave: 'Leave register',
    payroll: 'Muster input',
    delivery: 'Work delivery',
  };

  return (
    <div className="people-studio">
      <header className="people-studio__head">
        <h1 className="people-studio__title">Reports</h1>
        <div className="people-studio__actions">
          <select aria-label="Reporting period" value={period} onChange={(event) => setPeriod(event.target.value as Period)} className="people-studio__select">
            <option value="current">Current month</option>
            <option value="previous">Previous month</option>
            <option value="quarter">Current quarter</option>
            <option value="ytd">Year to date</option>
            <option value="custom">Custom range</option>
          </select>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} className="people-studio__btn people-studio__btn--secondary">Filters</button>
          {report !== 'user' && settings.allowCsvExport !== false && (
            <button type="button" onClick={exportCsv} className="people-studio__btn people-studio__btn--secondary">Export CSV</button>
          )}
          {report === 'user' && (
            <button
              type="button"
              disabled={!userReport}
              onClick={() => userReport && void downloadUserReportXlsx(userReport, String(state.organization?.name || 'Pixbe'))}
              className="people-studio__btn people-studio__btn--secondary"
            >
              Export Excel
            </button>
          )}
          <button type="button" onClick={() => void exportPdf()} disabled={isExportingPdf || (report === 'user' && !userReport)} className="people-studio__btn people-studio__btn--primary">
            {isExportingPdf ? 'Preparing PDF' : 'Download PDF'}
          </button>
          {isExecutive && (
            <Link href="/settings?section=reports" className="people-studio__btn people-studio__btn--secondary">Manage reports</Link>
          )}
        </div>
      </header>

      {filtersOpen && (
        <div className="people-studio__sheet people-studio__sheet--pad people-studio__filters-grid">
          {period === 'custom' && (
            <>
              <label className="people-studio__field">Start<input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
              <label className="people-studio__field">End<input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
            </>
          )}
          <label className="people-studio__field">
            Department
            <select value={department} onChange={(event) => setDepartment(event.target.value)}>
              {departments.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="people-studio__field">
            Search
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or ID" />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => { setDepartment('All'); setQuery(''); setPeriod('current'); setCustomStart(''); setCustomEnd(''); }}
              className="people-studio__btn people-studio__btn--ghost"
            >
              Reset filters
            </button>
          </div>
        </div>
      )}

      <nav aria-label="Report collections" className="people-studio__tabs no-scrollbar">
        {REPORTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setReport(item.id)}
            className={`people-studio__tab${report === item.id ? ' is-active' : ''}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {report !== 'user' && (
        <div className="people-studio__kpis">
          {compactMetrics.map((metric) => <StatCard key={metric.label} {...metric} />)}
        </div>
      )}

      {report === 'user' ? (
        <div className="grid min-h-0 gap-5 lg:grid-cols-[16.5rem_minmax(0,1fr)]">
          <Section title="People">
            {employeeRows.length ? (
              <ul className="divide-y divide-[var(--border-color)]">
                {employeeRows.map((item: any) => (
                  <li key={item.employee.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedUserId(item.employee.id)}
                      className={`flex w-full flex-col items-start px-3.5 py-2.5 text-left hover:bg-[#f8fbfe] ${selectedUserId === item.employee.id ? 'bg-[#f8fbfe]' : ''}`}
                    >
                      <span className="people-studio__role">{item.employee.name}</span>
                      <span className="people-studio__quiet">{item.employee.department}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No people match the current filters.</Empty>
            )}
          </Section>
          {userReport ? (
            <UserReportView report={userReport} organizationName={String(state.organization?.name || 'Pixbe')} showExport={false} />
          ) : (
            <Empty>Select a person to open their report.</Empty>
          )}
        </div>
      ) : report === 'overview' ? (
        <>
          <div className="people-studio__split people-studio__split--8-4">
            <Section title="Attendance trend">
              <div className="people-studio__chart">
                {trend.some((item) => item.present) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ border: '1px solid var(--border-color)', borderRadius: 7, fontSize: 12 }} />
                      <Line type="monotone" dataKey="present" stroke="#17324e" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty>No attendance records for this period.</Empty>
                )}
              </div>
            </Section>
            <Section title="Attention needed">
              <div className="people-studio__attention">
                {[
                  { label: 'Late arrivals', value: attendanceMetrics.late, target: 'attendance' as ReportId },
                  { label: 'Pending leave', value: pendingLeaves.length, target: 'leave' as ReportId },
                  { label: 'Pending regularizations', value: pendingRegularizations.length, target: 'compliance' as ReportId },
                  { label: 'Overdue tasks', value: overdueTasks.length, target: 'delivery' as ReportId },
                ].map((item) => (
                  <button key={item.label} type="button" onClick={() => setReport(item.target)}>
                    {item.label}
                    <span>{number(item.value)}</span>
                  </button>
                ))}
              </div>
            </Section>
          </div>
          <Section title={isInstitute ? 'Student attendance' : 'Attendance exceptions'}>
            {employeeRows.length ? <ReportTable rows={employeeRows.slice(0, 8)} mode="attendance" /> : <Empty>No people match the current filters.</Empty>}
          </Section>
        </>
      ) : (
        <>
          <div className="people-studio__split people-studio__split--7-5">
            <Section title={pageTitle}>
              <div className="people-studio__kpis is-flush">
                {[['Present days', attendanceMetrics.present], ['Late arrivals', attendanceMetrics.late], ['Working hours', attendanceMetrics.hours.toFixed(1)], ['Approved leave', leaveDays]].map(([label, value]) => (
                  <div key={String(label)} className="people-studio__kpi">
                    <p className="people-studio__kpi-label">{label}</p>
                    <p className="people-studio__kpi-value">{value}</p>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Current scope">
              <dl className="people-studio__scope">
                <div>
                  <dt>Period</dt>
                  <dd>{range.start} to {range.end}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{department}</dd>
                </div>
                <div>
                  <dt>People</dt>
                  <dd>{number(employees.length)}</dd>
                </div>
                <div>
                  <dt>Projects</dt>
                  <dd>{number(projects.length)}</dd>
                </div>
              </dl>
            </Section>
          </div>
          <Section title={tableTitle[report as Exclude<ReportId, 'overview' | 'user'>]}>
            {report === 'delivery' ? <DeliveryTable rows={tasks} /> : employeeRows.length ? <ReportTable rows={employeeRows} mode={report} /> : <Empty>No records match the current filters.</Empty>}
          </Section>
        </>
      )}
    </div>
  );
}

function ReportTable({ rows, mode }: { rows: any[]; mode: Exclude<ReportId, 'overview' | 'delivery' | 'user'> | 'attendance' }) {
  const config = mode === 'leave' ? ['Employee', 'Department', 'Leave days', 'Attendance rate'] : mode === 'compliance' ? ['Employee', 'Department', 'Hours', 'Late', 'Status'] : mode === 'payroll' ? ['Employee', 'Department', 'Present days', 'Leave days', 'Payable days'] : mode === 'workforce' ? ['Employee', 'Department', 'Present days', 'Leave days', 'Attendance rate'] : ['Employee', 'Department', 'Present days', 'Late', 'Attendance rate'];
  return (
    <div className="people-studio__table-wrap">
      <table>
        <thead>
          <tr>{config.map((label) => <th key={label}>{label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((item) => {
            const status = item.hours >= item.present * 8 ? 'On target' : 'Review';
            return (
              <tr key={item.employee.id}>
                <td className="people-studio__role">{item.employee.name}</td>
                <td className="people-studio__quiet">{item.employee.department}</td>
                {mode === 'leave' ? (
                  <>
                    <td>{item.leaves}</td>
                    <td>{percentage(item.rate)}</td>
                  </>
                ) : mode === 'compliance' ? (
                  <>
                    <td>{item.hours.toFixed(1)}</td>
                    <td>{item.late}</td>
                    <td>
                      <span className={`people-studio__status ${status === 'On target' ? 'people-studio__status--ok' : 'people-studio__status--wait'}`}>{status}</span>
                    </td>
                  </>
                ) : mode === 'payroll' ? (
                  <>
                    <td>{item.present}</td>
                    <td>{item.leaves}</td>
                    <td>{Math.max(0, item.present - item.leaves)}</td>
                  </>
                ) : (
                  <>
                    <td>{item.present}</td>
                    <td>{mode === 'workforce' ? item.leaves : item.late}</td>
                    <td>{percentage(item.rate)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryTable({ rows }: { rows: any[] }) {
  return (
    <div className="people-studio__table-wrap">
      <table>
        <thead>
          <tr>
            {['Task', 'Project', 'Assignee', 'Due date', 'Status'].map((label) => <th key={label}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => (
            <tr key={task.id}>
              <td className="people-studio__role">{task.title}</td>
              <td className="people-studio__quiet">{task.projectName || 'Unassigned'}</td>
              <td className="people-studio__quiet">{task.assigneeName || 'Unassigned'}</td>
              <td className="people-studio__quiet">{task.dueDate || 'No date'}</td>
              <td>
                <span className="people-studio__status people-studio__status--wait">{task.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
