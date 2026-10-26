'use client';
import { DateInput } from '@/components/common/DateInput';

import React, { useEffect, useMemo, useState } from 'react';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { MobileRow, MobileSection } from '@/components/mobile/MobilePrimitives';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CalendarDays, ChevronRight, Download, FileSpreadsheet, Search, Settings2, SlidersHorizontal, X } from 'lucide-react';
import { UserAvatar } from '@/components/common/UserAvatar';
import { WorkspacePagination } from '@/components/common/WorkspacePagination';
import styles from './reports-workspace.module.css';
import { ResponsiveTable } from '@/components/common/ResponsiveTable';
import { AppState } from '@/services/store';
import { getDefaultReportSettings } from '@/utils/reportCatalog';
import { isAdminPersona, isHRPersona, getTeamEmployees } from '@/utils/teamAccess';
import { api } from '@/services/apiClient';
import { UserReportView } from './UserReportView';
import { buildUserReport } from '@/utils/userReport';
import { downloadUserReportPdf, downloadUserReportXlsx } from '@/utils/userReportExport';
import { buildPayrollRun } from '@/utils/payrollRun';
import { isNamedWorkingDay, paidHolidayDates, workingDayNameSet } from '@/utils/holidays';

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
  { id: 'overview', label: 'Overview' },
  { id: 'workforce', label: 'Workforce' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'compliance', label: 'Time & compliance' },
  { id: 'leave', label: 'Leave' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'user', label: 'User report' },
];

const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
const dateOnly = (value?: string) => String(value || '').slice(0, 10);
const number = (value: number) => new Intl.NumberFormat().format(Math.round(value));
const percentage = (value: number) => `${Math.round(value * 10) / 10}%`;

function rangeFor(period: Period, customStart: string, customEnd: string) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  if (period === 'previous') {
    start.setMonth(start.getMonth() - 1, 1);
    end.setDate(0);
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

function workDays(start: string, end: string, workingDays?: string[]) {
  const names = workingDayNameSet(workingDays);
  let total = 0;
  const cursor = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (cursor <= last) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    if (isNamedWorkingDay(key, names)) total += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.max(1, total);
}

function StatCard({ label, value, comparison }: { label: string; value: string; comparison: string; accent?: string }) {
  return <div className={styles.metric}><p>{label}</p><strong>{value}</strong><span>{comparison}</span></div>;
}

function Section({ title, children, className = '', action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return <section className={`${styles.panel} ${className}`}><header className={styles.panelHead}><h2>{title}</h2>{action}</header>{children}</section>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className={styles.empty}><span className={styles.emptyMark}><FileSpreadsheet size={22} aria-hidden="true" /></span><p>{children}</p></div>;
}

function Status({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'success' | 'warning' | 'info' | 'danger' }) {
  return <span className={styles.status} data-tone={tone}>{children}</span>;
}

const formatRange = (start: string, end: string) => {
  const format = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${format(start)} – ${format(end)}`;
};

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
  const mobile = useMobileViewport();
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exportError, setExportError] = useState('');
  const range = rangeFor(period, customStart, customEnd);
  const rangeInvalid = period === 'custom' && (!customStart || !customEnd || customStart > customEnd);
  useEffect(() => { setPage(1); }, [report, period, customStart, customEnd, department, query]);
  const previous = previousRange(range.start, range.end);
  const isExecutive = isAdminPersona(state.currentPersona) || isHRPersona(state.currentPersona);
  const isInstitute = String(state.organization?.industry || '').toLowerCase().includes('institute');

  useEffect(() => {
    let current = true;
    if (department !== 'All' || rangeInvalid) {
      setServerSummary(null);
      return () => { current = false; };
    }
    setServerSummary(null);
    void api.reports.getSummary({ startDate: range.start, endDate: range.end })
      .then((response: any) => {
        if (current && response?.success && response.data) setServerSummary(response.data as ServerSummary);
      })
      .catch(() => {
        if (current) setServerSummary(null);
      });
    return () => { current = false; };
  }, [department, range.end, range.start, rangeInvalid]);

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
  const deliveryRows = tasks.filter((task: any) => !query || `${task.title} ${task.projectName || ''} ${task.assigneeName || ''} ${task.status}`.toLowerCase().includes(query.toLowerCase()));

  const attendanceMetrics = useMemo(() => {
    const holidayDates = (start: string, end: string) =>
      paidHolidayDates({
        holidays: state.customOptions?.holidays,
        start,
        end,
        workingDays: state.organization?.workingDays,
      }).map((holiday) => holiday.date);
    const withHolidays = (records: any[], people: any[], start: string, end: string) => {
      const present = new Set(
        records
          .filter((item: any) => ['Present', 'Late', 'Work From Home'].includes(item.status))
          .map((item: any) => `${item.employeeId}:${dateOnly(item.date)}`)
      );
      holidayDates(start, end).forEach((date) => {
        people.forEach((employee: any) => present.add(`${employee.id}:${date}`));
      });
      return present.size;
    };
    const present = withHolidays(scopedAttendance, employees, range.start, range.end);
    const late = scopedAttendance.filter((item: any) => item.status === 'Late').length;
    const expected = employees.length * workDays(range.start, range.end, state.organization?.workingDays);
    const rate = expected ? Math.min(100, (present / expected) * 100) : 0;
    const priorPresent = withHolidays(priorAttendance, employees, previous.start, previous.end);
    const priorExpected = employees.length * workDays(previous.start, previous.end, state.organization?.workingDays);
    const priorRate = priorExpected ? Math.min(100, (priorPresent / priorExpected) * 100) : 0;
    return { present, late, expected, rate, priorRate, hours: scopedAttendance.reduce((sum: number, item: any) => sum + (Number(item.workingHours) || 0), 0) };
  }, [employees, previous.end, previous.start, priorAttendance, range.end, range.start, scopedAttendance, state.customOptions?.holidays, state.organization?.workingDays]);

  const leaveDays = scopedLeaves.filter((item: any) => item.status === 'Approved').reduce((sum: number, item: any) => sum + (Number(item.daysCount) || 0), 0);
  const completedTasks = tasks.filter((task: any) => ['Completed', 'Approved'].includes(task.status)).length;
  const taskRate = tasks.length ? (completedTasks / tasks.length) * 100 : 0;
  const overdueTasks = tasks.filter((task: any) => task.dueDate && task.dueDate < dateKey(new Date()) && !['Completed', 'Approved'].includes(task.status));
  const pendingLeaves = scopedLeaves.filter((item: any) => item.status === 'Pending');
  const pendingRegularizations = scopedRegularizations.filter((item: any) => item.status === 'Pending');

  const trend = useMemo(() => {
    const today = dateKey(new Date());
    const trendEnd = range.start <= today && today < range.end ? today : range.end;
    const days = Math.min(7, Math.max(1, Math.round((new Date(`${trendEnd}T00:00:00`).getTime() - new Date(`${range.start}T00:00:00`).getTime()) / 86_400_000) + 1));
    return Array.from({ length: days }, (_, index) => {
      const day = new Date(`${trendEnd}T00:00:00`);
      day.setDate(day.getDate() - (days - index - 1));
      const key = dateKey(day);
      const present = scopedAttendance.filter((item: any) => dateOnly(item.date) === key && ['Present', 'Late', 'Work From Home'].includes(item.status)).length;
      return { day: key.slice(5), present };
    });
  }, [range.end, range.start, scopedAttendance]);

  const employeeRows = useMemo(() => employees.map((employee: any) => {
    const records = scopedAttendance.filter((item: any) => item.employeeId === employee.id);
    const presentDates = new Set(records.filter((item: any) => ['Present', 'Late', 'Work From Home'].includes(item.status)).map((item: any) => dateOnly(item.date)));
    paidHolidayDates({
      holidays: state.customOptions?.holidays,
      start: range.start,
      end: range.end,
      workingDays: state.organization?.workingDays,
    }).forEach((holiday) => presentDates.add(holiday.date));
    const present = presentDates.size;
    const late = records.filter((item: any) => item.status === 'Late').length;
    const hours = records.reduce((sum: number, item: any) => sum + (Number(item.workingHours) || 0), 0);
    const leaves = scopedLeaves.filter((item: any) => item.employeeId === employee.id && item.status === 'Approved').reduce((sum: number, item: any) => sum + (Number(item.daysCount) || 0), 0);
    return { employee, present, late, hours, leaves, rate: workDays(range.start, range.end, state.organization?.workingDays) ? (present / workDays(range.start, range.end, state.organization?.workingDays)) * 100 : 0 };
  }).filter((item: any) => !query || `${item.employee.name} ${item.employee.employeeId} ${item.employee.department}`.toLowerCase().includes(query.toLowerCase())), [employees, query, range.end, range.start, scopedAttendance, scopedLeaves, state.customOptions?.holidays, state.organization?.workingDays]);

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
        companyCreatedAt: state.organization?.createdAt,
        workingDays: state.organization?.workingDays,
        holidays: state.customOptions?.holidays,
        timeZone: state.organization?.timeZone,
        attendanceSettings: state.customOptions?.attendanceSettings,
        year: start.getFullYear(),
        month: start.getMonth() + 1,
      }).lines[0] || null
    );
  }, [range.start, selectedUser, state.attendance, state.customOptions, state.leaves, state.organization, state.timesheets]);
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
            holidays: state.customOptions?.holidays,
            workingDays: state.organization?.workingDays,
          })
        : null,
    [range, selectedUser, state.attendance, state.customOptions, state.leaves, state.organization, state.tasks, state.timesheets, userPayrollLine]
  );
  const exportTable = useMemo(() => {
    if (report === 'user') {
      return { title: 'User Report', headers: ['Employee'], rows: [] as Array<Array<string | number>> };
    }
    if (report === 'delivery') {
      return {
        title: 'Work delivery',
        headers: ['Task', 'Project', 'Assignee', 'Due date', 'Status'],
        rows: deliveryRows.map((task: any) => [task.title, task.projectName || 'Unassigned', task.assigneeName || 'Unassigned', task.dueDate || 'No date', task.status]),
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
  }, [employeeRows, pageTitle, report, deliveryRows]);

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
    { label: isInstitute ? 'Active students' : 'Active headcount', value: number(serverSummary?.workforce.activeHeadcount ?? employees.length), comparison: `${department === 'All' ? departments.length - 1 : 1} departments`, accent: '#17324e' },
    { label: 'Attendance rate', value: percentage(serverSummary?.attendance.attendanceRate ?? attendanceMetrics.rate), comparison: `${attendanceMetrics.rate >= attendanceMetrics.priorRate ? '+' : ''}${(attendanceMetrics.rate - attendanceMetrics.priorRate).toFixed(1)} pts`, accent: '#53886b' },
    { label: 'Approved leave', value: number(serverSummary?.leave.approvedDays ?? leaveDays), comparison: `${serverSummary?.leave.pendingRequests ?? pendingLeaves.length} pending`, accent: '#17324e' },
    { label: 'Task completion', value: percentage(serverSummary?.delivery.totalTasks ? (serverSummary.delivery.completedTasks / serverSummary.delivery.totalTasks) * 100 : taskRate), comparison: `${serverSummary?.delivery.overdueTasks ?? overdueTasks.length} overdue`, accent: '#53886b' },
  ];

  const exportPdf = async () => {
    setExportError('');
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
          metrics: reportMetrics.map((metric) => ({ ...metric, accent: '#17324e' })),
          table: exportTable,
        });
      }
    } catch {
      setExportError('The PDF could not be prepared. Please try again.');
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

  const openUser = (id: string) => { setSelectedUserId(id); setReport('user'); };
  const resetFilters = () => { setDepartment('All'); setQuery(''); setPeriod('current'); setCustomStart(''); setCustomEnd(''); };
  const hasFilters = department !== 'All' || Boolean(query) || period !== 'current';
  const totalRows = report === 'delivery' ? deliveryRows.length : employeeRows.length;
  const currentPage = Math.min(page, Math.max(1, Math.ceil(totalRows / pageSize)));
  const offset = (currentPage - 1) * pageSize;
  const reportMetrics = report === 'delivery' ? [
    { label: 'Assigned tasks', value: number(tasks.length), comparison: `${projects.length} projects` },
    { label: 'Completed', value: number(completedTasks), comparison: `${percentage(taskRate)} completion` },
    { label: 'Overdue', value: number(overdueTasks.length), comparison: 'Open tasks past their due date' },
    { label: 'In progress', value: number(tasks.filter((task: any) => !['Completed', 'Approved', 'To Do', 'To do', 'Pending'].includes(task.status)).length), comparison: 'Across the current team' },
  ] : report === 'overview' || report === 'workforce' ? compactMetrics : [
    { label: 'Present days', value: number(attendanceMetrics.present), comparison: `${employees.length} people in scope` },
    { label: 'Late arrivals', value: number(attendanceMetrics.late), comparison: `${percentage(attendanceMetrics.rate)} attendance` },
    { label: 'Working hours', value: attendanceMetrics.hours.toFixed(1), comparison: 'Recorded attendance hours' },
    { label: 'Approved leave', value: number(leaveDays), comparison: `${pendingLeaves.length} requests pending` },
  ];
  const pagination = <WorkspacePagination total={totalRows} page={currentPage} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />;
  const renderTable = () => report === 'delivery'
    ? deliveryRows.length ? <DeliveryTable rows={deliveryRows.slice(offset, offset + pageSize)} /> : <Empty>No tasks match the current filters.</Empty>
    : employeeRows.length ? <ReportTable rows={employeeRows.slice(offset, offset + pageSize)} mode={report === 'overview' || report === 'user' ? 'attendance' : report} onOpenUser={openUser} /> : <Empty>No people match the current filters.</Empty>;

  if (mobile && report === 'overview') {
    return <div className="m2-page">
      <div className="m2-report-filters">
        <label><span className="sr-only">Reporting period</span><select value={period} onChange={event => setPeriod(event.target.value as Period)}><option value="current">This month</option><option value="previous">Previous month</option><option value="quarter">This quarter</option><option value="ytd">Year to date</option><option value="custom">Custom range</option></select></label>
        <label><span className="sr-only">Department</span><select value={department} onChange={event => setDepartment(event.target.value)}>{departments.map(item => <option key={item} value={item}>{item === 'All' ? 'My team' : item}</option>)}</select></label>
      </div>
      {period === 'custom' && <div className="m2-report-filters"><label>Start date<DateInput value={customStart} onChange={event => setCustomStart(event.target.value)} /></label><label>End date<DateInput value={customEnd} min={customStart || undefined} onChange={event => setCustomEnd(event.target.value)} /></label></div>}
      <div className="m2-metric"><span>Attendance rate</span><strong>{percentage(attendanceMetrics.rate)}</strong></div>
      <div className="m2-metric"><span>Project completion</span><strong>{percentage(taskRate)}</strong></div>
      <MobileSection title="Explore reports">
        <MobileRow title="Attendance & leave" detail="Presence, hours and absence trends" onClick={() => setReport('attendance')} />
        <MobileRow title="Time & productivity" detail="Logged hours by project and person" onClick={() => setReport('compliance')} />
        <MobileRow title="Payroll summary" detail="Period totals and employee reports" onClick={() => setReport('payroll')} />
      </MobileSection>
      <button type="button" className="m2-secondary" disabled={rangeInvalid || isExportingPdf} onClick={() => void exportPdf()}>{isExportingPdf ? 'Preparing report…' : 'Export report'}</button>
      {exportError && <p role="alert" className="m2-empty">{exportError}</p>}
    </div>;
  }
  return (
    <div className={styles.workspace}>
      {mobile && <button type="button" className="m2-row" onClick={() => setReport('overview')}>All reports</button>}
      <header className={styles.pageHead}>
        <h1>Reports</h1>
        <div className={styles.actions}>
          {isExecutive && <Link href="/settings?section=reports" className={styles.settingsLink}><Settings2 size={16} aria-hidden="true" />Report settings</Link>}
          {report !== 'user' && settings.allowCsvExport !== false && <button type="button" disabled={rangeInvalid} onClick={exportCsv} className={styles.button}><FileSpreadsheet size={16} aria-hidden="true" />Export CSV</button>}
          {report === 'user' && <button type="button" disabled={!userReport || rangeInvalid} onClick={() => { if (userReport) { setExportError(''); void downloadUserReportXlsx(userReport, String(state.organization?.name || 'Pixbe')).catch(() => setExportError('The Excel file could not be prepared. Please try again.')); } }} className={styles.button}><FileSpreadsheet size={16} aria-hidden="true" />Export Excel</button>}
          <button type="button" onClick={() => void exportPdf()} disabled={rangeInvalid || isExportingPdf || (report === 'user' && !userReport)} className={`${styles.button} ${styles.primary}`}><Download size={16} aria-hidden="true" />{isExportingPdf ? 'Preparing PDF…' : 'Download PDF'}</button>
        </div>
      </header>

      <nav aria-label="Report collections" className={styles.tabs}>
        {REPORTS.map((item) => <button key={item.id} type="button" aria-current={report === item.id ? 'page' : undefined} onClick={() => setReport(item.id)}>{item.label}</button>)}
      </nav>

      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={16} aria-hidden="true" /><input aria-label={report === 'delivery' ? 'Search tasks' : 'Search people'} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={report === 'delivery' ? 'Search task, project or assignee' : 'Search name, employee ID or department'} />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button>}</label>
        <label className={styles.field}>Department<select aria-label="Department" value={department} onChange={(event) => setDepartment(event.target.value)}>{departments.map((item) => <option key={item} value={item}>{item === 'All' ? 'All departments' : item}</option>)}</select></label>
        <label className={styles.field}>Reporting period<select aria-label="Reporting period" value={period} onChange={(event) => setPeriod(event.target.value as Period)}><option value="current">Current month</option><option value="previous">Previous month</option><option value="quarter">Current quarter</option><option value="ytd">Year to date</option><option value="custom">Custom range</option></select></label>
        <button type="button" aria-expanded={filtersOpen || period === 'custom'} aria-controls="report-date-filters" onClick={() => setFiltersOpen((open) => !open)} className={`${styles.button} ${styles.filterButton}`}><SlidersHorizontal size={16} aria-hidden="true" />Date range</button>
        {hasFilters && <button type="button" onClick={resetFilters} className={styles.textButton}>Reset</button>}
      </div>
      {(filtersOpen || period === 'custom') && <div id="report-date-filters" className={styles.dateFilters}>
        <label className={styles.field}>Start date<DateInput value={period === 'custom' ? customStart : range.start} max={customEnd || undefined} onChange={(event) => { setCustomStart(event.target.value); if (period !== 'custom') setCustomEnd(range.end); setPeriod('custom'); }} /></label>
        <label className={styles.field}>End date<DateInput value={period === 'custom' ? customEnd : range.end} min={customStart || undefined} onChange={(event) => { setCustomEnd(event.target.value); if (period !== 'custom') setCustomStart(range.start); setPeriod('custom'); }} /></label>
        {rangeInvalid && <p role="status">Choose a start and end date. The end date must be on or after the start date.</p>}
      </div>}
      {exportError && <p className={styles.error} role="alert">{exportError}</p>}

      <div className={styles.scopeBar}><span><CalendarDays size={14} aria-hidden="true" />{rangeInvalid ? 'Choose a reporting period' : formatRange(range.start, range.end)}</span><span>{department === 'All' ? 'All departments' : department}</span><span>{number(employees.length)} {isInstitute ? 'students' : 'people'}</span>{report === 'delivery' && <span>Tasks · All time</span>}</div>

      {rangeInvalid ? <Empty>Select a valid date range to view your report.</Empty> : report === 'user' ? (
        <div className={styles.userLayout}>
          <Section title={isInstitute ? 'Students' : 'People'} className={styles.peoplePanel} action={<span className={styles.count}>{employeeRows.length}</span>}>
            {employeeRows.length ? <ul className={styles.peopleList}>{employeeRows.map((item: any) => <li key={item.employee.id}><button type="button" onClick={() => setSelectedUserId(item.employee.id)} aria-pressed={selectedUserId === item.employee.id}><UserAvatar name={item.employee.name} src={item.employee.avatar} className={styles.avatar} /><span><strong>{item.employee.name}</strong><small>{item.employee.department || 'No department'}</small></span><ChevronRight size={14} aria-hidden="true" /></button></li>)}</ul> : <Empty>No people match your search.</Empty>}
          </Section>
          <div className={styles.userDetail}>{userReport ? <div className={styles.userReport}><UserReportView report={userReport} organizationName={String(state.organization?.name || 'Pixbe')} showExport={false} /></div> : <div className={styles.selectPerson}><Empty>Select a person to view attendance, tasks, leave, and payroll.</Empty></div>}</div>
        </div>
      ) : (
        <>
          <div className={styles.metrics}>{reportMetrics.map((metric) => <StatCard key={metric.label} {...metric} />)}</div>
          {report === 'overview' && <div className={styles.overviewGrid}>
            <Section title="Attendance trend" action={<span className={styles.count}>Last {trend.length} days of selected period</span>}>
              <div className={styles.chart}>
                {trend.some((item) => item.present) ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{ top: 12, right: 20, left: -12, bottom: 0 }}><CartesianGrid stroke="var(--border-color)" vertical={false} strokeDasharray="3 4" /><XAxis dataKey="day" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickMargin={12} /><YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12, background: 'var(--bg-surface)', color: 'var(--text-primary)' }} /><Area isAnimationActive={false} type="monotone" dataKey="present" name="Present" stroke="var(--primary-blue)" fill="var(--studio-focus)" fillOpacity={0.5} strokeWidth={2} /></AreaChart></ResponsiveContainer> : <Empty>No attendance recorded for these dates.</Empty>}
              </div><div className={styles.chartLegend}><i />Present, late, and work from home</div>
            </Section>
            <Section title="Attention needed" action={<span className={styles.count}>In this period</span>}>
              <div className={styles.attention}>{[
                { label: 'Late arrivals', hint: 'Attendance & punctuality', value: attendanceMetrics.late, target: 'attendance' as ReportId },
                { label: 'Pending leave', hint: 'Leave & availability', value: pendingLeaves.length, target: 'leave' as ReportId },
                { label: 'Regularizations', hint: 'Awaiting a decision', value: pendingRegularizations.length, target: 'compliance' as ReportId },
                { label: 'Overdue tasks', hint: 'Work delivery · All time', value: overdueTasks.length, target: 'delivery' as ReportId },
              ].map((item) => <button key={item.label} type="button" onClick={() => setReport(item.target)}><span><strong>{item.label}</strong><small>{item.hint}</small></span><b>{number(item.value)}</b><ArrowRight size={15} aria-hidden="true" /></button>)}</div>
            </Section>
          </div>}
          <Section title={report === 'overview' ? (isInstitute ? 'Student attendance' : 'Employee attendance') : tableTitle[report]} action={<span className={styles.count}>{totalRows} {report === 'delivery' ? 'tasks' : 'people'}</span>}>
            {renderTable()}
            {pagination}
          </Section>
          <footer className={styles.pageFooter}><span>{report === 'delivery' ? 'All assigned tasks in your accessible workspace.' : 'Select an employee to open their detailed report.'}</span><span>{pageTitle}</span></footer>
        </>
      )}
    </div>
  );
}

function ReportTable({ rows, mode, onOpenUser }: { rows: any[]; mode: Exclude<ReportId, 'overview' | 'delivery' | 'user'> | 'attendance'; onOpenUser: (id: string) => void }) {
  const config = mode === 'leave' ? ['Employee', 'Department', 'Leave days', 'Attendance rate'] : mode === 'compliance' ? ['Employee', 'Department', 'Hours', 'Late', 'Status'] : mode === 'payroll' ? ['Employee', 'Department', 'Present days', 'Leave days', 'Payable days'] : mode === 'workforce' ? ['Employee', 'Department', 'Present days', 'Leave days', 'Attendance rate'] : ['Employee', 'Department', 'Present days', 'Late', 'Attendance rate'];
  const rate = (value: number) => <span className={styles.rate}><span className={styles.rateTrack}><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></span>{percentage(value)}</span>;
  return <div className={styles.tableScroll}><ResponsiveTable className={styles.table}><thead><tr>{config.map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((item) => {
    const status = item.hours >= item.present * 8 ? 'On target' : 'Review';
    return <tr key={item.employee.id}>
      <td><button type="button" className={styles.person} onClick={() => onOpenUser(item.employee.id)}><UserAvatar name={item.employee.name} src={item.employee.avatar} className={styles.avatar} /><span><strong>{item.employee.name}</strong><small>{item.employee.employeeId || item.employee.designation || 'View report'}</small></span></button></td>
      <td><span className={styles.department}>{item.employee.department || '—'}</span></td>
      {mode === 'leave' ? <><td>{item.leaves}</td><td>{rate(item.rate)}</td></> : mode === 'compliance' ? <><td>{item.hours.toFixed(1)}</td><td>{item.late}</td><td><Status tone={status === 'On target' ? 'success' : 'warning'}>{status}</Status></td></> : mode === 'payroll' ? <><td>{item.present}</td><td>{item.leaves}</td><td>{Math.max(0, item.present - item.leaves)}</td></> : <><td>{item.present}</td><td>{mode === 'workforce' ? item.leaves : item.late}</td><td>{rate(item.rate)}</td></>}
    </tr>;
  })}</tbody></ResponsiveTable></div>;
}

function DeliveryTable({ rows }: { rows: any[] }) {
  return <div className={styles.tableScroll}><ResponsiveTable className={styles.table}><thead><tr>{['Task', 'Project', 'Assignee', 'Due date', 'Status'].map((label) => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((task) => <tr key={task.id}><td className={styles.taskName}>{task.title}</td><td>{task.projectName || 'Unassigned'}</td><td>{task.assigneeName || 'Unassigned'}</td><td>{task.dueDate ? new Date(`${dateOnly(task.dueDate)}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No date'}</td><td><Status tone={['Completed','Approved'].includes(task.status) ? 'success' : task.dueDate && task.dueDate < dateKey(new Date()) ? 'danger' : 'info'}>{task.status}</Status></td></tr>)}</tbody></ResponsiveTable></div>;
}
