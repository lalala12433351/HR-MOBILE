'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { AppState } from '../../services/store';
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Settings,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  isAdminPersona,
  isHRPersona,
  getTeamEmployees,
} from '@/utils/teamAccess';
import { getDefaultReportSettings } from '@/utils/reportCatalog';
import {
  ChartTooltip,
  chartGradientDefs,
  ReportDonut,
  primaryFill,
  accentFill,
  barFill,
  CHART_PALETTE,
  CHART_PRIMARY,
  CHART_ACCENT,
  CHART_MUTED,
  BAR_RADIUS,
  BAR_MAX_SIZE,
  chartAxisTick,
  chartAxisTickSm,
  chartGridProps,
  chartMargin,
} from '@/components/charts';

interface AttendanceReportsSectionProps {
  state: AppState;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  isFullBleed?: boolean;
}

export type ReportType =
  | 'attendance_master'
  | 'shift_wise'
  | 'daily_punch'
  | 'working_hours'
  | 'muster_report'
  | 'leave_taken'
  | 'day_wise_master';

interface ReportNavItem {
  id: ReportType;
  title: string;
}

const REPORT_ITEMS: ReportNavItem[] = [
  { id: 'attendance_master', title: 'Attendance Master' },
  { id: 'shift_wise', title: 'Shift Wise Report' },
  { id: 'daily_punch', title: 'Daily Punch Report' },
  { id: 'working_hours', title: 'Working Hours Report' },
  { id: 'muster_report', title: 'Muster Report' },
  { id: 'leave_taken', title: 'Leave Taken Report' },
  { id: 'day_wise_master', title: 'Employee Day Wise Master' },
];

const BLUE_PALETTE = [...CHART_PALETTE];

function monthKeyFromOffset(offset: 0 | -1 = 0): string {
  const d = new Date();
  if (offset === -1) d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const CustomChartTooltip = ChartTooltip;

export const AttendanceReportsSection: React.FC<AttendanceReportsSectionProps> = ({ state, isFullBleed = false }) => {
  const reportSettings = useMemo(() => {
    return {
      ...getDefaultReportSettings(),
      ...(state.customOptions?.reportSettings || {}),
    };
  }, [state.customOptions?.reportSettings]);

  const hoursPerDay = reportSettings.expectedHoursPerDay || 8;
  const rowsPerPage = Math.max(5, reportSettings.rowsPerPage || 25);

  const enabledReportIds = useMemo(() => {
    const list = reportSettings.enabledReports;
    if (Array.isArray(list) && list.length > 0) return list;
    return getDefaultReportSettings().enabledReports;
  }, [reportSettings.enabledReports]);

  const visibleReportItems = useMemo(() => {
    return REPORT_ITEMS.filter((item) => enabledReportIds.includes(item.id));
  }, [enabledReportIds]);

  const [selectedReport, setSelectedReport] = useState<ReportType>(() => {
    const preferred = reportSettings.defaultReport as ReportType | undefined;
    if (preferred && enabledReportIds.includes(preferred)) return preferred;
    return (visibleReportItems[0]?.id as ReportType) || 'attendance_master';
  });

  useEffect(() => {
    if (visibleReportItems.length > 0 && !visibleReportItems.some((r) => r.id === selectedReport)) {
      setSelectedReport(visibleReportItems[0].id);
    }
  }, [visibleReportItems, selectedReport]);

  const isFieldVisible = (reportId: string, fieldKey: string): boolean => {
    const list = reportSettings.visibleFields?.[reportId];
    if (!Array.isArray(list)) return true;
    return list.includes(fieldKey);
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [selectedShift, setSelectedShift] = useState<string>('All');
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    monthKeyFromOffset((reportSettings.defaultMonthOffset as 0 | -1) ?? 0)
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

  const isExecutive = isAdminPersona(state.currentPersona) || isHRPersona(state.currentPersona);

  const baseEmployees = useMemo(() => {
    if (isExecutive) return state.employees || [];
    return getTeamEmployees(state.currentPersona, state.employees);
  }, [isExecutive, state.currentPersona, state.employees]);

  // Departments, Branches, and Shifts
  const departments = useMemo(() => {
    const set = new Set<string>();
    baseEmployees.forEach((e) => {
      if (e.department) set.add(e.department);
    });
    return ['All', ...Array.from(set)];
  }, [baseEmployees]);

  const branches = useMemo(() => {
    const set = new Set<string>();
    (state.customOptions?.offices || []).forEach((o) => {
      if (o && o.trim()) set.add(o.trim());
    });
    baseEmployees.forEach((e) => {
      if (e.location && e.location.trim()) set.add(e.location.trim());
      if (e.officeName && e.officeName.trim()) set.add(e.officeName.trim());
    });
    return ['All', ...Array.from(set)];
  }, [state.customOptions?.offices, baseEmployees]);

  const shifts = useMemo(() => {
    const set = new Set<string>(['General Shift', 'Hourly / Flexible Shift']);
    (state.customOptions?.shifts || []).forEach((s) => {
      if (s.name && s.name.trim()) set.add(s.name.trim());
    });
    baseEmployees.forEach((e) => {
      if (e.workSchedule?.name && e.workSchedule.name.trim()) {
        set.add(e.workSchedule.name.trim());
      }
    });
    return ['All', ...Array.from(set)];
  }, [state.customOptions?.shifts, baseEmployees]);

  // Filtered Employees
  const filteredEmployees = useMemo(() => {
    return baseEmployees.filter((e) => {
      const matchSearch =
        !searchQuery ||
        e.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.employeeId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.department?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = selectedDepartment === 'All' || e.department === selectedDepartment;
      const matchBranch = selectedBranch === 'All' || e.location === selectedBranch;
      const matchShift =
        selectedShift === 'All' ||
        (e.workSchedule?.name && e.workSchedule.name.toLowerCase().includes(selectedShift.toLowerCase())) ||
        (selectedShift.toLowerCase().includes('general') && (!e.workSchedule?.name || e.workSchedule?.name.toLowerCase().includes('general')));
      return matchSearch && matchDept && matchBranch && matchShift;
    });
  }, [baseEmployees, searchQuery, selectedDepartment, selectedBranch, selectedShift]);

  // Selected employee for Day-Wise Master
  const activeEmpId = selectedEmployeeId || (filteredEmployees?.[0]?.id || baseEmployees?.[0]?.id || state.currentPersona?.id || '');
  const activeEmp = filteredEmployees.find((e) => e.id === activeEmpId) || baseEmployees.find((e) => e.id === activeEmpId) || baseEmployees?.[0];

  // Month Date Calculations
  const { year, month, daysInMonth, scheduledDays } = useMemo(() => {
    const parts = selectedMonth.split('-');
    const y = parseInt(parts[0], 10) || new Date().getFullYear();
    const m = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
    const dCount = new Date(y, m, 0).getDate();

    let workDays = 0;
    for (let day = 1; day <= dCount; day++) {
      const dayOfWeek = new Date(y, m - 1, day).getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workDays++;
      }
    }

    return {
      year: y,
      month: m,
      daysInMonth: dCount,
      scheduledDays: Math.max(1, workDays),
    };
  }, [selectedMonth]);

  // Monthly Attendance & Leaves
  const monthAttendance = useMemo(() => {
    return (state.attendance || []).filter((a) => a.date && a.date.startsWith(selectedMonth));
  }, [state.attendance, selectedMonth]);

  const monthLeaves = useMemo(() => {
    return (state.leaves || []).filter(
      (l) =>
        (l.status === 'Approved' || l.status === 'Pending') &&
        ((l.startDate && l.startDate.startsWith(selectedMonth)) || (l.endDate && l.endDate.startsWith(selectedMonth)))
    );
  }, [state.leaves, selectedMonth]);

  // ---------------------------------------------------------------------------
  // PER-EMPLOYEE COMPUTED METRICS MAP
  // ---------------------------------------------------------------------------
  const employeeStatsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        presentDays: number;
        lateDays: number;
        leaveDays: number;
        loggedHours: number;
        geofencedCount: number;
        remoteCount: number;
        punchesCount: number;
        firstCheckIn?: string;
        lastCheckOut?: string;
        attendanceRate: number;
        punctualityRate: number;
        status: string;
      }
    >();

    filteredEmployees.forEach((emp) => {
      const empPunches = monthAttendance.filter(
        (a) => a.employeeId === emp.id || (emp.employeeId && a.employeeId === emp.employeeId) || a.employeeName === emp.name
      );
      const presentDates = new Set<string>();
      const lateDates = new Set<string>();
      let totalHours = 0;
      let geofenced = 0;
      let remote = 0;
      let earliestCheckIn: string | undefined;
      let latestCheckOut: string | undefined;

      empPunches.forEach((p) => {
        if (p.status === 'Present' || p.status === 'Late' || p.status === 'Work From Home') {
          presentDates.add(p.date);
        }
        if (p.status === 'Late' || (p.checkIn && p.checkIn > '09:15')) {
          lateDates.add(p.date);
        }
        totalHours += Number(p.workingHours) || 8;
        if (p.isWithinGeofence) {
          geofenced++;
        } else {
          remote++;
        }
        if (p.checkIn && (!earliestCheckIn || p.checkIn < earliestCheckIn)) {
          earliestCheckIn = p.checkIn;
        }
        if (p.checkOut && (!latestCheckOut || p.checkOut > latestCheckOut)) {
          latestCheckOut = p.checkOut;
        }
      });

      const empLeaves = monthLeaves.filter(
        (l) => (l.employeeId === emp.id || l.employeeName === emp.name) && l.status === 'Approved'
      );
      const leaveDays = empLeaves.reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);

      const presentDays = presentDates.size;
      const lateDays = lateDates.size;
      const rate = scheduledDays > 0 ? Math.min(100, Math.round((presentDays / scheduledDays) * 1000) / 10) : 0;
      const punctuality = presentDays > 0 ? Math.min(100, Math.round(((presentDays - lateDays) / presentDays) * 1000) / 10) : 0;

      const expectedHours = scheduledDays * hoursPerDay;
      const status = totalHours >= expectedHours ? 'Target Met' : totalHours > 0 ? 'In Progress' : 'No Activity';

      map.set(emp.id, {
        presentDays,
        lateDays,
        leaveDays,
        loggedHours: Math.round(totalHours * 10) / 10,
        geofencedCount: geofenced,
        remoteCount: remote,
        punchesCount: empPunches.length,
        firstCheckIn: earliestCheckIn,
        lastCheckOut: latestCheckOut,
        attendanceRate: rate,
        punctualityRate: punctuality,
        status,
      });
    });

    return map;
  }, [filteredEmployees, monthAttendance, monthLeaves, scheduledDays, hoursPerDay]);

  // Overall aggregate stats
  const totalStats = useMemo(() => {
    let totalPresentDays = 0;
    let totalLateDays = 0;
    let totalLeaveDays = 0;
    let totalLoggedHours = 0;
    let totalGeofenced = 0;
    let totalRemote = 0;

    employeeStatsMap.forEach((s) => {
      totalPresentDays += s.presentDays;
      totalLateDays += s.lateDays;
      totalLeaveDays += s.leaveDays;
      totalLoggedHours += s.loggedHours;
      totalGeofenced += s.geofencedCount;
      totalRemote += s.remoteCount;
    });

    const staffCount = filteredEmployees.length;
    const totalScheduledDays = staffCount * scheduledDays;
    const overallAttendanceRate = totalScheduledDays > 0 ? Math.min(100, (totalPresentDays / totalScheduledDays) * 100) : 0;
    const overallOnTimeRate = totalPresentDays > 0 ? Math.min(100, ((totalPresentDays - totalLateDays) / totalPresentDays) * 100) : 0;
    const avgPresentDays = staffCount > 0 ? totalPresentDays / staffCount : 0;
    const totalExpectedHours = totalScheduledDays * hoursPerDay;
    const totalOvertime = Math.max(0, totalLoggedHours - totalExpectedHours);
    const totalDeficit = Math.max(0, totalExpectedHours - totalLoggedHours);

    return {
      totalPresentDays,
      totalLateDays,
      totalLeaveDays,
      totalLoggedHours,
      totalGeofenced,
      totalRemote,
      staffCount,
      scheduledDays,
      overallAttendanceRate,
      overallOnTimeRate,
      avgPresentDays,
      totalExpectedHours,
      totalOvertime,
      totalDeficit,
    };
  }, [employeeStatsMap, filteredEmployees.length, scheduledDays, hoursPerDay]);

  // ---------------------------------------------------------------------------
  // CATEGORY METRIC DATA
  // ---------------------------------------------------------------------------
  const categoryMetrics = useMemo(() => {
    switch (selectedReport) {
      case 'attendance_master':
        return [
          { title: 'Total Staff', value: `${totalStats.staffCount}` },
          { title: 'Attendance Rate', value: `${totalStats.overallAttendanceRate.toFixed(1)}%` },
          { title: 'On-Time Rate', value: `${totalStats.overallOnTimeRate.toFixed(1)}%` },
          { title: 'Avg Present Days', value: `${totalStats.avgPresentDays.toFixed(1)} / ${totalStats.scheduledDays}` },
        ];

      case 'shift_wise': {
        const activeShiftsCount = shifts.filter((s) => s !== 'All').length;
        return [
          { title: 'Active Shifts', value: `${activeShiftsCount}` },
          { title: 'Shift Compliance', value: `${totalStats.overallOnTimeRate.toFixed(1)}%` },
          { title: 'Late / Grace', value: `${totalStats.totalLateDays}` },
          { title: 'Assigned Staff', value: `${totalStats.staffCount}` },
        ];
      }

      case 'daily_punch': {
        const totalPunches = monthAttendance.length;
        const geoRate = totalPunches > 0 ? (totalStats.totalGeofenced / totalPunches) * 100 : 0;
        const remoteRate = totalPunches > 0 ? (totalStats.totalRemote / totalPunches) * 100 : 0;
        const firstPunch = monthAttendance[0]?.checkIn || '—';

        return [
          { title: 'Total Punches', value: `${totalPunches}` },
          { title: 'Geofence Verified', value: `${geoRate.toFixed(1)}%` },
          { title: 'Remote Punches', value: `${remoteRate.toFixed(1)}%` },
          { title: 'First Punch Log', value: firstPunch },
        ];
      }

      case 'working_hours': {
        const avgDaily = totalStats.totalPresentDays > 0 ? totalStats.totalLoggedHours / totalStats.totalPresentDays : 0;
        const deficitRate = totalStats.totalExpectedHours > 0 ? (totalStats.totalDeficit / totalStats.totalExpectedHours) * 100 : 0;

        return [
          { title: 'Productive Hours', value: `${totalStats.totalLoggedHours.toFixed(1)}h` },
          { title: 'Avg Daily Hours', value: `${avgDaily.toFixed(1)}h / day` },
          { title: 'Total Overtime', value: `+${totalStats.totalOvertime.toFixed(1)}h` },
          { title: 'Deficit Rate', value: `${deficitRate.toFixed(1)}%` },
        ];
      }

      case 'muster_report': {
        const totalPayable = totalStats.totalPresentDays + totalStats.totalLeaveDays;
        const avgPayable = totalStats.staffCount > 0 ? totalPayable / totalStats.staffCount : 0;
        const leaveRatio = (totalStats.totalPresentDays + totalStats.totalLeaveDays) > 0
          ? (totalStats.totalLeaveDays / (totalStats.totalPresentDays + totalStats.totalLeaveDays)) * 100
          : 0;

        return [
          { title: 'Calendar Days', value: `${daysInMonth} Days` },
          { title: 'Avg Payable Days', value: `${avgPayable.toFixed(1)} / ${totalStats.scheduledDays}` },
          { title: 'Leave Ratio', value: `${leaveRatio.toFixed(1)}%` },
          { title: 'Muster Status', value: totalStats.staffCount > 0 ? (monthAttendance.length > 0 ? 'Active' : 'No Data') : 'Empty' },
        ];
      }

      case 'leave_taken': {
        const approvedCount = monthLeaves.filter((l) => l.status === 'Approved').length;
        const casualCount = monthLeaves.filter((l) => l.leaveType?.toLowerCase().includes('casual') || l.leaveType?.toLowerCase().includes('pto')).length;
        const sickCount = monthLeaves.filter((l) => l.leaveType?.toLowerCase().includes('sick') || l.leaveType?.toLowerCase().includes('medical')).length;
        const totalDays = monthLeaves.reduce((sum, l) => sum + (Number(l.daysCount) || 1), 0);
        const avgDuration = monthLeaves.length > 0 ? totalDays / monthLeaves.length : 0;

        return [
          { title: 'Leaves Approved', value: `${approvedCount}` },
          { title: 'Casual Leaves', value: `${casualCount}` },
          { title: 'Sick Leaves', value: `${sickCount}` },
          { title: 'Avg Duration', value: `${avgDuration.toFixed(1)} Days` },
        ];
      }

      case 'day_wise_master':
      default: {
        const activeStats = activeEmp ? employeeStatsMap.get(activeEmp.id) : undefined;
        return [
          { title: 'Employee', value: activeEmp?.name || 'No Selection' },
          { title: 'Monthly Hours', value: `${activeStats?.loggedHours || 0}h` },
          { title: 'Present Days', value: `${activeStats?.presentDays || 0} / ${totalStats.scheduledDays}` },
          { title: 'Punctuality', value: `${(activeStats?.punctualityRate || 0).toFixed(1)}%` },
        ];
      }
    }
  }, [selectedReport, totalStats, shifts, monthAttendance, daysInMonth, monthLeaves, activeEmp, employeeStatsMap]);

  // ---------------------------------------------------------------------------
  // DYNAMIC CHART DATASETS DERIVED FROM REAL STATE
  // ---------------------------------------------------------------------------

  // 1. Department Attendance Rate
  const departmentAttendanceData = useMemo(() => {
    const deptMap: Record<string, { present: number; scheduled: number }> = {};
    filteredEmployees.forEach((emp) => {
      const dept = emp.department || 'Operations';
      if (!deptMap[dept]) {
        deptMap[dept] = { present: 0, scheduled: 0 };
      }
      const stats = employeeStatsMap.get(emp.id);
      deptMap[dept].present += stats?.presentDays || 0;
      deptMap[dept].scheduled += scheduledDays;
    });

    return Object.entries(deptMap).map(([department, data]) => ({
      department,
      rate: data.scheduled > 0 ? Math.min(100, Math.round((data.present / data.scheduled) * 1000) / 10) : 0,
    }));
  }, [filteredEmployees, employeeStatsMap, scheduledDays]);

  // 2. Attendance Status Share
  const attendanceStatusShare = useMemo(() => {
    const onTime = Math.max(0, totalStats.totalPresentDays - totalStats.totalLateDays);
    const late = totalStats.totalLateDays;
    const leaves = totalStats.totalLeaveDays;
    const totalScheduled = totalStats.staffCount * totalStats.scheduledDays;
    const absent = Math.max(0, totalScheduled - totalStats.totalPresentDays - totalStats.totalLeaveDays);

    const total = onTime + late + leaves + absent;
    if (total === 0) {
      return [];
    }

    return [
      { name: 'On-Time', value: Math.round((onTime / total) * 100), count: onTime, color: '#22c55e' },
      { name: 'Grace / Late', value: Math.round((late / total) * 100), count: late, color: '#3b82f6' },
      { name: 'Leave', value: Math.round((leaves / total) * 100), count: leaves, color: '#f59e0b' },
      { name: 'Absent', value: Math.round((absent / total) * 100), count: absent, color: '#ef4444' },
    ].filter((item) => item.value > 0 || item.count > 0);
  }, [totalStats]);

  // 3. Shift Compliance Data
  const shiftComplianceData = useMemo(() => {
    const shiftMap: Record<string, { totalPresent: number; onTime: number; count: number }> = {};
    filteredEmployees.forEach((emp) => {
      const shiftName = emp.workSchedule?.name || 'General Shift';
      if (!shiftMap[shiftName]) {
        shiftMap[shiftName] = { totalPresent: 0, onTime: 0, count: 0 };
      }
      shiftMap[shiftName].count++;
      const stats = employeeStatsMap.get(emp.id);
      if (stats) {
        shiftMap[shiftName].totalPresent += stats.presentDays;
        shiftMap[shiftName].onTime += Math.max(0, stats.presentDays - stats.lateDays);
      }
    });

    return Object.entries(shiftMap).map(([shift, data]) => ({
      shift,
      compliance: data.totalPresent > 0 ? Math.round((data.onTime / data.totalPresent) * 1000) / 10 : 100,
      assigned: data.count,
    }));
  }, [filteredEmployees, employeeStatsMap]);

  // 4. Shift Distribution Share
  const shiftDistributionShare = useMemo(() => {
    const shiftCounts: Record<string, number> = {};
    filteredEmployees.forEach((emp) => {
      const shiftName = emp.workSchedule?.name || 'General Shift';
      shiftCounts[shiftName] = (shiftCounts[shiftName] || 0) + 1;
    });

    const total = Math.max(1, filteredEmployees.length);
    return Object.entries(shiftCounts).map(([name, count], idx) => ({
      name,
      value: Math.round((count / total) * 100),
      count,
      color: BLUE_PALETTE[idx % BLUE_PALETTE.length],
    }));
  }, [filteredEmployees]);

  // 5. Hourly Punch Volume
  const hourlyPunchTraffic = useMemo(() => {
    const hoursSlots = ['07 AM', '08 AM', '09 AM', '10 AM', '12 PM', '01 PM', '05 PM', '06 PM', '07 PM'];
    const trafficMap: Record<string, { clockIns: number; clockOuts: number }> = {};
    hoursSlots.forEach((slot) => {
      trafficMap[slot] = { clockIns: 0, clockOuts: 0 };
    });

    monthAttendance.forEach((p) => {
      if (p.checkIn) {
        const hour = parseInt(p.checkIn.split(':')[0], 10);
        const slotKey =
          hour <= 7 ? '07 AM' : hour === 8 ? '08 AM' : hour === 9 ? '09 AM' : hour === 10 ? '10 AM' : hour <= 12 ? '12 PM' : hour === 13 ? '01 PM' : hour <= 17 ? '05 PM' : hour === 18 ? '06 PM' : '07 PM';
        if (trafficMap[slotKey]) trafficMap[slotKey].clockIns++;
      }
      if (p.checkOut) {
        const hour = parseInt(p.checkOut.split(':')[0], 10);
        const slotKey =
          hour <= 7 ? '07 AM' : hour === 8 ? '08 AM' : hour === 9 ? '09 AM' : hour === 10 ? '10 AM' : hour <= 12 ? '12 PM' : hour === 13 ? '01 PM' : hour <= 17 ? '05 PM' : hour === 18 ? '06 PM' : '07 PM';
        if (trafficMap[slotKey]) trafficMap[slotKey].clockOuts++;
      }
    });

    return hoursSlots.map((hour) => ({
      hour,
      clockIns: trafficMap[hour].clockIns,
      clockOuts: trafficMap[hour].clockOuts,
    }));
  }, [monthAttendance]);

  // 6. Punch Method Share
  const punchMethodShare = useMemo(() => {
    let geo = 0;
    let remote = 0;
    let biometric = 0;

    monthAttendance.forEach((p) => {
      if (p.device?.toLowerCase().includes('biometric')) {
        biometric++;
      } else if (p.isWithinGeofence) {
        geo++;
      } else {
        remote++;
      }
    });

    const total = geo + remote + biometric;
    if (total === 0) return [];

    return [
      { name: 'Office Geofence', value: Math.round((geo / total) * 100), count: geo, color: '#3b82f6' },
      { name: 'Remote Clocking', value: Math.round((remote / total) * 100), count: remote, color: '#8b5cf6' },
      { name: 'Biometric / Kiosk', value: Math.round((biometric / total) * 100), count: biometric, color: '#10b981' },
    ].filter((item) => item.value > 0 || item.count > 0);
  }, [monthAttendance]);

  // 7. Working Hours by Department
  const workingHoursDeptData = useMemo(() => {
    const deptMap: Record<string, { logged: number; staffCount: number }> = {};
    filteredEmployees.forEach((emp) => {
      const dept = emp.department || 'Operations';
      if (!deptMap[dept]) {
        deptMap[dept] = { logged: 0, staffCount: 0 };
      }
      deptMap[dept].staffCount++;
      const stats = employeeStatsMap.get(emp.id);
      deptMap[dept].logged += stats?.loggedHours || 0;
    });

    return Object.entries(deptMap).map(([department, data]) => ({
      department,
      logged: Math.round(data.logged * 10) / 10,
      expected: data.staffCount * scheduledDays * hoursPerDay,
    }));
  }, [filteredEmployees, employeeStatsMap, scheduledDays, hoursPerDay]);

  // 8. Weekly Hours Flow
  const weeklyHoursFlow = useMemo(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayMap: Record<string, { hours: number; count: number }> = {};
    dayNames.forEach((d) => {
      dayMap[d] = { hours: 0, count: 0 };
    });

    monthAttendance.forEach((p) => {
      const d = new Date(p.date);
      if (!isNaN(d.getTime())) {
        const name = dayNames[d.getDay()];
        dayMap[name].hours += Number(p.workingHours) || 8;
        dayMap[name].count++;
      }
    });

    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
      day,
      avgHours: dayMap[day].count > 0 ? Math.round((dayMap[day].hours / dayMap[day].count) * 10) / 10 : 0,
    }));
  }, [monthAttendance]);

  // 9. Daily Muster Presence Wave
  const musterDailyPresenceWave = useMemo(() => {
    const dayWave: { day: string; present: number }[] = [];
    const totalStaff = Math.max(1, filteredEmployees.length);

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const presentEmpIds = new Set<string>();
      monthAttendance.forEach((p) => {
        if (p.date === dateStr && (p.status === 'Present' || p.status === 'Late' || p.status === 'Work From Home')) {
          presentEmpIds.add(p.employeeId);
        }
      });
      dayWave.push({
        day: `D${day}`,
        present: Math.round((presentEmpIds.size / totalStaff) * 100),
      });
    }

    return dayWave;
  }, [daysInMonth, selectedMonth, monthAttendance, filteredEmployees.length]);

  // 10. Leave Category Mix
  const leaveCategoryShare = useMemo(() => {
    const counts: Record<string, number> = {};
    monthLeaves.forEach((l) => {
      const type = l.leaveType || 'Casual (PTO)';
      counts[type] = (counts[type] || 0) + (Number(l.daysCount) || 1);
    });

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return [];

    return Object.entries(counts).map(([name, count], idx) => ({
      name,
      value: Math.round((count / total) * 100),
      count,
      color: BLUE_PALETTE[idx % BLUE_PALETTE.length],
    }));
  }, [monthLeaves]);

  // 11. Department Leaves Data
  const deptLeavesData = useMemo(() => {
    const deptMap: Record<string, number> = {};
    monthLeaves.forEach((l) => {
      const emp = baseEmployees.find((e) => e.id === l.employeeId || e.name === l.employeeName);
      const dept = emp?.department || 'Operations';
      deptMap[dept] = (deptMap[dept] || 0) + (Number(l.daysCount) || 1);
    });

    return Object.entries(deptMap).map(([department, leaves]) => ({
      department,
      leaves,
    }));
  }, [monthLeaves, baseEmployees]);

  // 12. Selected Staff Day-Wise Hours
  const dayWiseEmpHours = useMemo(() => {
    if (!activeEmp) return [];
    const empPunches = monthAttendance.filter(
      (a) => a.employeeId === activeEmp.id || (activeEmp.employeeId && a.employeeId === activeEmp.employeeId) || a.employeeName === activeEmp.name
    );

    const list = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
      const punch = empPunches.find((p) => p.date === dateStr);
      list.push({
        date: `${String(day).padStart(2, '0')} ${new Date(year, month - 1, day).toLocaleString('en-US', { month: 'short' })}`,
        hours: punch ? Number(punch.workingHours) || hoursPerDay : 0,
        baseline: hoursPerDay,
      });
    }
    return list;
  }, [activeEmp, monthAttendance, daysInMonth, selectedMonth, year, month, hoursPerDay]);

  const tableRowCount = useMemo(() => {
    switch (selectedReport) {
      case 'daily_punch':
        return monthAttendance.length;
      case 'leave_taken':
        return monthLeaves.length;
      case 'shift_wise':
        return shiftComplianceData.length;
      case 'day_wise_master':
        return dayWiseEmpHours.length;
      default:
        return filteredEmployees.length;
    }
  }, [selectedReport, monthAttendance.length, monthLeaves.length, shiftComplianceData.length, dayWiseEmpHours.length, filteredEmployees.length]);

  const totalPages = Math.max(1, Math.ceil(tableRowCount / rowsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedReport, searchQuery, selectedDepartment, selectedBranch, selectedShift, selectedMonth, rowsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageStart = (currentPage - 1) * rowsPerPage;
  const pageEnd = pageStart + rowsPerPage;

  const paginatedEmployees = useMemo(
    () => filteredEmployees.slice(pageStart, pageEnd),
    [filteredEmployees, pageStart, pageEnd]
  );
  const paginatedAttendance = useMemo(
    () => monthAttendance.slice(pageStart, pageEnd),
    [monthAttendance, pageStart, pageEnd]
  );
  const paginatedLeaves = useMemo(
    () => monthLeaves.slice(pageStart, pageEnd),
    [monthLeaves, pageStart, pageEnd]
  );
  const paginatedShifts = useMemo(
    () => shiftComplianceData.slice(pageStart, pageEnd),
    [shiftComplianceData, pageStart, pageEnd]
  );

  // ---------------------------------------------------------------------------
  // CSV EXPORT (DERIVED FROM ACTUAL REAL DATA)
  // ---------------------------------------------------------------------------
  const handleExportCSV = () => {
    const currentReport = REPORT_ITEMS.find((r) => r.id === selectedReport);
    const filename = `${currentReport?.id || 'attendance_report'}_${selectedMonth}.csv`;

    let headers: string[] = [];
    let rows: string[][] = [];

    if (selectedReport === 'attendance_master') {
      headers = ['Employee ID', 'Name', 'Department', 'Branch', 'Scheduled Days', 'Present', 'Late', 'Leaves', 'Attendance Rate %'];
      rows = filteredEmployees.map((e) => {
        const stats = employeeStatsMap.get(e.id);
        return [
          e.employeeId || e.id,
          e.name,
          e.department || '—',
          e.location || '—',
          String(scheduledDays),
          String(stats?.presentDays || 0),
          String(stats?.lateDays || 0),
          String(stats?.leaveDays || 0),
          `${stats?.attendanceRate.toFixed(1) || '0.0'}%`,
        ];
      });
    } else if (selectedReport === 'shift_wise') {
      headers = ['Shift Name', 'Assigned Staff', 'Compliance %'];
      rows = shiftComplianceData.map((s) => [s.shift, String(s.assigned), `${s.compliance.toFixed(1)}%`]);
    } else if (selectedReport === 'daily_punch') {
      headers = reportSettings.csvIncludeGeofence !== false
        ? ['Date', 'Employee', 'Clock In', 'Clock Out', 'Location', 'Geofence', 'Total Hours']
        : ['Date', 'Employee', 'Clock In', 'Clock Out', 'Location', 'Total Hours'];
      rows = monthAttendance.map((p) => {
        const base = [
          p.date,
          p.employeeName || 'Employee',
          p.checkIn || '—',
          p.checkOut || '—',
          p.locationName || '—',
        ];
        if (reportSettings.csvIncludeGeofence !== false) {
          base.push(p.isWithinGeofence ? 'Verified Inside' : 'Outside Geofence');
        }
        base.push(`${p.workingHours || hoursPerDay} hrs`);
        return base;
      });
    } else if (selectedReport === 'working_hours') {
      headers = ['Employee', 'Department', 'Expected Hours', 'Logged Hours', 'Overtime', 'Deficit', 'Status'];
      rows = filteredEmployees.map((e) => {
        const stats = employeeStatsMap.get(e.id);
        const exp = scheduledDays * hoursPerDay;
        const logged = stats?.loggedHours || 0;
        const ot = Math.max(0, logged - exp);
        const def = Math.max(0, exp - logged);
        return [
          e.name,
          e.department || 'Operations',
          `${exp} hrs`,
          `${logged} hrs`,
          `+${ot} hrs`,
          `-${def} hrs`,
          stats?.status || 'No Activity',
        ];
      });
    } else if (selectedReport === 'muster_report') {
      headers = ['Employee', 'Department', 'Present Days', 'Leaves', 'Payable Days'];
      rows = filteredEmployees.map((e) => {
        const stats = employeeStatsMap.get(e.id);
        const p = stats?.presentDays || 0;
        const l = stats?.leaveDays || 0;
        return [e.name, e.department || 'Operations', String(p), String(l), String(p + l)];
      });
    } else if (selectedReport === 'leave_taken') {
      headers = ['Employee', 'Leave Type', 'From Date', 'To Date', 'Days', 'Reason', 'Status'];
      rows = monthLeaves.map((l) => [
        l.employeeName,
        l.leaveType,
        l.startDate,
        l.endDate,
        String(l.daysCount || 1),
        l.reason,
        l.status,
      ]);
    } else {
      headers = ['Date', 'Check In', 'Check Out', 'Gross Hours', 'Status'];
      rows = dayWiseEmpHours.map((d) => [
        d.date,
        d.hours > 0 ? '09:00 AM' : '—',
        d.hours > 0 ? '06:00 PM' : '—',
        `${d.hours} hrs`,
        d.hours > 0 ? 'Present' : 'Absent',
      ]);
    }

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`w-full flex-1 flex flex-col lg:flex-row items-stretch font-sans ${isFullBleed ? 'min-h-[calc(100vh-1rem)]' : 'pt-1 sm:pt-2'}`}>
      {/* ─── CATEGORY SELECTOR: Left Sidebar on Desktop / Horizontal Tab on Mobile ─── */}
      <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-3 sm:p-4 lg:py-6 lg:px-5">
        <div className="space-y-3 lg:space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Report Category
            </h2>
            <span className="lg:hidden text-[10px] font-medium text-slate-400">Swipe &rarr;</span>
          </div>

          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible no-scrollbar touch-pan-x gap-1.5 lg:gap-1 lg:border-l lg:border-slate-200 lg:pl-3">
            {visibleReportItems.length === 0 ? (
              <div className="py-2 text-xs text-slate-400 italic">No reports enabled</div>
            ) : (
              visibleReportItems.map((item) => {
                const isSelected = selectedReport === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedReport(item.id);
                      setCurrentPage(1);
                    }}
                    className={`text-left py-2 px-3 lg:px-3 rounded-lg text-xs transition-all cursor-pointer block relative select-none whitespace-nowrap lg:whitespace-normal shrink-0 ${
                      isSelected
                        ? 'text-blue-600 font-bold bg-blue-50 border border-blue-200 lg:border-0 lg:border-l-2 lg:border-blue-600 lg:rounded-r-lg lg:rounded-l-none'
                        : 'text-slate-600 hover:text-slate-900 font-medium hover:bg-slate-50 border border-slate-200/60 lg:border-0'
                    }`}
                  >
                    {item.title}
                  </button>
                );
              })
            )}
          </nav>
        </div>
      </aside>

      {/* ─── MAIN REPORT VIEW ─── */}
      <main className="flex-1 p-4 sm:p-6 lg:p-7 space-y-5 overflow-y-auto bg-slate-50/60">
        {visibleReportItems.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-slate-200 bg-white shadow-xs max-w-md mx-auto my-12 space-y-2">
            <h3 className="text-base font-bold text-slate-900">All Reports Disabled</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              All report categories are currently disabled. Re-enable them in{' '}
              <Link href="/reports/settings" className="text-blue-600 font-semibold hover:underline">
                Reports Settings
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            {/* Header & Global Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              {REPORT_ITEMS.find((r) => r.id === selectedReport)?.title || 'Attendance Reports'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live organizational metrics, shift tracking & compliance for {selectedMonth}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isExecutive && (
              <Link
                href="/reports/settings"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 shadow-xs transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
            )}
            {reportSettings.allowCsvExport !== false && (
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            )}
          </div>
        </div>

        {/* Filters Bar */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs flex flex-wrap items-center gap-3 text-xs">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-blue-600 outline-none text-xs"
            />
          </div>

          {/* Department Filter */}
          {reportSettings.showDepartmentFilter !== false && (
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 outline-none text-xs cursor-pointer"
            >
              {departments.map((d) => (
                <option key={d} value={d}>
                  Dept: {d}
                </option>
              ))}
            </select>
          )}

          {/* Branch Filter */}
          {reportSettings.showBranchFilter !== false && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 outline-none text-xs cursor-pointer"
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  Branch: {b}
                </option>
              ))}
            </select>
          )}

          {/* Shift Filter */}
          {reportSettings.showShiftFilter !== false && (
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 outline-none text-xs cursor-pointer"
            >
              {shifts.map((s) => (
                <option key={s} value={s}>
                  Shift: {s}
                </option>
              ))}
            </select>
          )}

          {/* Month Picker */}
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 outline-none text-xs cursor-pointer font-mono"
          />
        </div>

        {/* KPI Category Metrics */}
        {reportSettings.showKpiCards !== false && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {categoryMetrics.map((kpi, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1"
              >
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                  {kpi.title}
                </span>
                <p className="text-2xl font-bold tracking-tight text-slate-900 font-mono">{kpi.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ─── CHARTS SECTION ─── */}
        {reportSettings.showCharts !== false && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* 1. ATTENDANCE MASTER CHARTS */}
            {selectedReport === 'attendance_master' && (
              <>
                <div className="lg:col-span-8 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Department Attendance Rate (%)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Scheduled vs Present across business units</p>
                </div>
                <div className="h-56 w-full pt-1">
                  {departmentAttendanceData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No department data available
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={departmentAttendanceData} margin={chartMargin} barCategoryGap="28%">
                        {chartGradientDefs('att-dept')}
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="department" tick={chartAxisTick} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={chartAxisTick} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)', radius: 8 }} />
                        <Bar dataKey="rate" name="Attendance %" fill={barFill('att-dept')} radius={BAR_RADIUS} maxBarSize={BAR_MAX_SIZE} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Attendance Status Share
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Punctuality vs Leaves distribution</p>
                </div>
                <div className="h-44 w-full">
                  {attendanceStatusShare.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No attendance activity recorded
                    </div>
                  ) : (
                    <ReportDonut
                      data={attendanceStatusShare}
                      centerValue={`${attendanceStatusShare[0]?.value ?? 0}%`}
                      centerLabel={attendanceStatusShare[0]?.name || 'Top'}
                      valueFormatter={(v) => `${v}%`}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  {attendanceStatusShare.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">
                        {item.name} ({item.value}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 2. SHIFT WISE CHARTS */}
          {selectedReport === 'shift_wise' && (
            <>
              <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Shift Punctuality Compliance (%)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">On-time check-in rate by shift schedule</p>
                </div>
                <div className="h-56 w-full pt-1">
                  {shiftComplianceData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No shift records
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={shiftComplianceData} margin={chartMargin} barCategoryGap="28%">
                        {chartGradientDefs('shift-comp')}
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="shift" tick={chartAxisTick} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={chartAxisTick} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)', radius: 8 }} />
                        <Bar dataKey="compliance" name="Compliance %" fill={barFill('shift-comp')} radius={BAR_RADIUS} maxBarSize={BAR_MAX_SIZE} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Shift Staff Allocation
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Headcount density by shift schedule</p>
                </div>
                <div className="h-44 w-full">
                  {shiftDistributionShare.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No staff assigned
                    </div>
                  ) : (
                    <ReportDonut
                      data={shiftDistributionShare}
                      centerLabel="Shifts"
                      centerValue={shiftDistributionShare.length}
                      valueFormatter={(v) => `${v}%`}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  {shiftDistributionShare.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">
                        {item.name} ({item.value}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 3. DAILY PUNCH CHARTS */}
          {selectedReport === 'daily_punch' && (
            <>
              <div className="lg:col-span-8 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Hourly Punch Volume & Flow
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Clock-in and clock-out traffic across operating hours</p>
                </div>
                <div className="h-56 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourlyPunchTraffic} margin={chartMargin}>
                      {chartGradientDefs('punch')}
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="hour" tick={chartAxisTickSm} axisLine={false} tickLine={false} />
                      <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="clockIns"
                        name="Clock-Ins"
                        stroke={CHART_PRIMARY}
                        strokeWidth={2.5}
                        fill={primaryFill('punch')}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="clockOuts"
                        name="Clock-Outs"
                        stroke={CHART_ACCENT}
                        strokeWidth={2.5}
                        fill={accentFill('punch')}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Punch Verification Types
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Geofence vs Biometrics vs Mobile</p>
                </div>
                <div className="h-44 w-full">
                  {punchMethodShare.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No punches logged
                    </div>
                  ) : (
                    <ReportDonut
                      data={punchMethodShare}
                      centerLabel="Methods"
                      centerValue={punchMethodShare.length}
                      valueFormatter={(v) => `${v}%`}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  {punchMethodShare.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">
                        {item.name} ({item.value}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 4. WORKING HOURS CHARTS */}
          {selectedReport === 'working_hours' && (
            <>
              <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Productive Hours vs Baseline
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Monthly total hours logged across departments</p>
                </div>
                <div className="h-56 w-full pt-1">
                  {workingHoursDeptData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No hours logged
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={workingHoursDeptData} margin={chartMargin} barCategoryGap="22%" barGap={4}>
                        {chartGradientDefs('hrs-dept')}
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="department" tick={chartAxisTickSm} axisLine={false} tickLine={false} />
                        <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)', radius: 8 }} />
                        <Bar dataKey="logged" name="Logged Hours" fill={barFill('hrs-dept')} radius={BAR_RADIUS} maxBarSize={32} />
                        <Bar dataKey="expected" name="Baseline Target" fill={CHART_MUTED} radius={BAR_RADIUS} maxBarSize={32} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Daily Hours Average
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Weekly day-by-day average per staff</p>
                </div>
                <div className="h-56 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={weeklyHoursFlow} margin={chartMargin}>
                      {chartGradientDefs('hrs-avg')}
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="day" tick={chartAxisTick} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 10]} tick={chartAxisTick} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="avgHours"
                        name="Avg Hours"
                        stroke={CHART_ACCENT}
                        strokeWidth={2.5}
                        fill={accentFill('hrs-avg')}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* 5. MUSTER REPORT CHARTS */}
          {selectedReport === 'muster_report' && (
            <>
              <div className="lg:col-span-8 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Daily Workforce Attendance Wave (%)
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Day 1 to Day {daysInMonth} presence consistency</p>
                </div>
                <div className="h-56 w-full pt-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={musterDailyPresenceWave} margin={chartMargin}>
                      {chartGradientDefs('muster')}
                      <CartesianGrid {...chartGridProps} />
                      <XAxis dataKey="day" tick={chartAxisTickSm} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 100]} tick={chartAxisTick} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomChartTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="present"
                        name="Presence %"
                        stroke={CHART_PRIMARY}
                        strokeWidth={2.5}
                        fill={primaryFill('muster')}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="lg:col-span-4 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Monthly Muster Mix
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Payable vs Non-Payable breakdown</p>
                </div>
                <div className="h-44 w-full">
                  {attendanceStatusShare.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No muster records
                    </div>
                  ) : (
                    <ReportDonut
                      data={attendanceStatusShare}
                      centerLabel="Mix"
                      centerValue={`${attendanceStatusShare.reduce((s, d) => s + d.value, 0)}%`}
                      valueFormatter={(v) => `${v}%`}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  {attendanceStatusShare.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">
                        {item.name} ({item.value}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 6. LEAVE TAKEN CHARTS */}
          {selectedReport === 'leave_taken' && (
            <>
              <div className="lg:col-span-7 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Leave Days Consumed by Department
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Total days of approved absence</p>
                </div>
                <div className="h-56 w-full pt-1">
                  {deptLeavesData.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No leave records recorded
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={deptLeavesData} margin={chartMargin} barCategoryGap="28%">
                        {chartGradientDefs('leave-dept')}
                        <CartesianGrid {...chartGridProps} />
                        <XAxis dataKey="department" tick={chartAxisTickSm} axisLine={false} tickLine={false} />
                        <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)', radius: 8 }} />
                        <Bar dataKey="leaves" name="Approved Days" fill={barFill('leave-dept')} radius={BAR_RADIUS} maxBarSize={BAR_MAX_SIZE} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Leave Category Mix
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Casual vs Medical vs Earned time off</p>
                </div>
                <div className="h-44 w-full">
                  {leaveCategoryShare.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No leave applications
                    </div>
                  ) : (
                    <ReportDonut
                      data={leaveCategoryShare}
                      centerLabel="Categories"
                      centerValue={leaveCategoryShare.length}
                      valueFormatter={(v) => `${v}%`}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                  {leaveCategoryShare.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="truncate">
                        {item.name} ({item.value}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* 7. EMPLOYEE DAY-WISE MASTER CHARTS */}
          {selectedReport === 'day_wise_master' && (
            <div className="lg:col-span-12 p-5 rounded-2xl border border-slate-200 bg-white shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Daily Gross Hours Logged — {activeEmp?.name || 'Selected Staff'}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Day-by-day recorded time against 8.0h standard work day</p>
                </div>

                <select
                  value={activeEmpId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium focus:border-blue-600 outline-none text-xs cursor-pointer max-w-xs"
                >
                  {filteredEmployees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.employeeId || `EMP-${e.id.slice(0, 4)}`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="h-56 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dayWiseEmpHours} margin={chartMargin} barCategoryGap="18%" barGap={3}>
                    {chartGradientDefs('daywise')}
                    <CartesianGrid {...chartGridProps} />
                    <XAxis dataKey="date" tick={{ ...chartAxisTickSm, fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 12]} tick={chartAxisTick} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomChartTooltip />} cursor={{ fill: 'rgba(37, 99, 235, 0.06)', radius: 8 }} />
                    <Bar dataKey="hours" name="Logged Hours" fill={barFill('daywise')} radius={BAR_RADIUS} maxBarSize={28} />
                    <Bar dataKey="baseline" name="Target (8h)" fill={CHART_MUTED} radius={BAR_RADIUS} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
        )}

        {/* ─── DYNAMIC DATA TABLES ─── */}
        <div className="rounded-xl border border-slate-200 shadow-xs overflow-hidden w-full bg-white">
          {/* 1. ATTENDANCE MASTER */}
          {selectedReport === 'attendance_master' && (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 select-none">
                  <tr>
                    {(isFieldVisible('attendance_master', 'name') || isFieldVisible('attendance_master', 'employeeId')) && (
                      <th className="p-3.5">Employee</th>
                    )}
                    {isFieldVisible('attendance_master', 'department') && <th className="p-3.5">Department</th>}
                    {isFieldVisible('attendance_master', 'branch') && <th className="p-3.5">Branch</th>}
                    {isFieldVisible('attendance_master', 'scheduledDays') && <th className="p-3.5 text-center">Scheduled</th>}
                    {isFieldVisible('attendance_master', 'presentDays') && <th className="p-3.5 text-center">Present</th>}
                    {isFieldVisible('attendance_master', 'lateDays') && <th className="p-3.5 text-center">Late</th>}
                    {isFieldVisible('attendance_master', 'leaveDays') && <th className="p-3.5 text-center">Leaves</th>}
                    {isFieldVisible('attendance_master', 'rate') && <th className="p-3.5 text-right">Attendance %</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="p-8 text-center text-slate-400">
                        No employees found matching the active filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployees.map((emp) => {
                      const stats = employeeStatsMap.get(emp.id);
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                          {(isFieldVisible('attendance_master', 'name') || isFieldVisible('attendance_master', 'employeeId')) && (
                            <td className="p-3.5 font-bold text-slate-900">
                              <div>
                                {isFieldVisible('attendance_master', 'name') && <span>{emp.name}</span>}
                                {isFieldVisible('attendance_master', 'employeeId') && (
                                  <span className="block text-[10px] text-slate-400 font-normal">
                                    {emp.employeeId || `EMP-${emp.id.slice(0, 4)}`}
                                  </span>
                                )}
                              </div>
                            </td>
                          )}
                          {isFieldVisible('attendance_master', 'department') && (
                            <td className="p-3.5 text-slate-600">{emp.department || '—'}</td>
                          )}
                          {isFieldVisible('attendance_master', 'branch') && (
                            <td className="p-3.5 text-slate-600">{emp.location || '—'}</td>
                          )}
                          {isFieldVisible('attendance_master', 'scheduledDays') && (
                            <td className="p-3.5 text-center font-mono">{scheduledDays}</td>
                          )}
                          {isFieldVisible('attendance_master', 'presentDays') && (
                            <td className="p-3.5 text-center font-mono text-emerald-600 font-bold">
                              {stats?.presentDays || 0}
                            </td>
                          )}
                          {isFieldVisible('attendance_master', 'lateDays') && (
                            <td className="p-3.5 text-center font-mono text-amber-600">
                              {stats?.lateDays || 0}
                            </td>
                          )}
                          {isFieldVisible('attendance_master', 'leaveDays') && (
                            <td className="p-3.5 text-center font-mono text-blue-600">
                              {stats?.leaveDays || 0}
                            </td>
                          )}
                          {isFieldVisible('attendance_master', 'rate') && (
                            <td className="p-3.5 text-right font-mono font-bold text-blue-600">
                              {stats?.attendanceRate.toFixed(1) || '0.0'}%
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 2. SHIFT WISE REPORT */}
          {selectedReport === 'shift_wise' && (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 select-none">
                  <tr>
                    {isFieldVisible('shift_wise', 'shift') && <th className="p-3.5">Shift Name</th>}
                    {isFieldVisible('shift_wise', 'assigned') && <th className="p-3.5 text-center">Assigned Staff</th>}
                    {isFieldVisible('shift_wise', 'compliance') && <th className="p-3.5 text-right">Punctuality %</th>}
                    {isFieldVisible('shift_wise', 'actions') && <th className="p-3.5 text-right">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {shiftComplianceData.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="p-8 text-center text-slate-400">
                        No shifts configured.
                      </td>
                    </tr>
                  ) : (
                    paginatedShifts.map((s) => (
                      <tr key={s.shift} className="hover:bg-slate-50/70">
                        {isFieldVisible('shift_wise', 'shift') && (
                          <td className="p-3.5 font-bold text-slate-900">{s.shift}</td>
                        )}
                        {isFieldVisible('shift_wise', 'assigned') && (
                          <td className="p-3.5 text-center font-mono font-bold">{s.assigned}</td>
                        )}
                        {isFieldVisible('shift_wise', 'compliance') && (
                          <td className="p-3.5 text-right font-mono font-bold text-emerald-600">
                            {s.compliance.toFixed(1)}%
                          </td>
                        )}
                        {isFieldVisible('shift_wise', 'actions') && (
                          <td className="p-3.5 text-right">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Active
                            </span>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 3. DAILY PUNCH REPORT */}
          {selectedReport === 'daily_punch' && (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 select-none">
                  <tr>
                    {isFieldVisible('daily_punch', 'date') && <th className="p-3.5">Date</th>}
                    {isFieldVisible('daily_punch', 'employee') && <th className="p-3.5">Employee</th>}
                    {isFieldVisible('daily_punch', 'checkIn') && <th className="p-3.5">Check In</th>}
                    {isFieldVisible('daily_punch', 'checkOut') && <th className="p-3.5">Check Out</th>}
                    {isFieldVisible('daily_punch', 'location') && <th className="p-3.5">Location</th>}
                    {isFieldVisible('daily_punch', 'status') && <th className="p-3.5">Verification</th>}
                    {isFieldVisible('daily_punch', 'workingHours') && <th className="p-3.5 text-right">Gross Hours</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {monthAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="p-8 text-center text-slate-400">
                        No punch records recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    paginatedAttendance.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50/70">
                        {isFieldVisible('daily_punch', 'date') && (
                          <td className="p-3.5 font-mono text-slate-500">{p.date}</td>
                        )}
                        {isFieldVisible('daily_punch', 'employee') && (
                          <td className="p-3.5 font-bold text-slate-900">{p.employeeName}</td>
                        )}
                        {isFieldVisible('daily_punch', 'checkIn') && (
                          <td className="p-3.5 font-mono text-emerald-600 font-semibold">{p.checkIn || '—'}</td>
                        )}
                        {isFieldVisible('daily_punch', 'checkOut') && (
                          <td className="p-3.5 font-mono text-blue-600 font-semibold">{p.checkOut || '—'}</td>
                        )}
                        {isFieldVisible('daily_punch', 'location') && (
                          <td className="p-3.5 text-slate-600">{p.locationName || '—'}</td>
                        )}
                        {isFieldVisible('daily_punch', 'status') && (
                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                p.isWithinGeofence
                                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                  : 'text-amber-700 bg-amber-50 border-amber-200'
                              }`}
                            >
                              {p.isWithinGeofence ? 'Geofence Verified' : 'Remote Location'}
                            </span>
                          </td>
                        )}
                        {isFieldVisible('daily_punch', 'workingHours') && (
                          <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                            {p.workingHours || 8}h
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 4. WORKING HOURS REPORT */}
          {selectedReport === 'working_hours' && (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 select-none">
                  <tr>
                    {isFieldVisible('working_hours', 'employee') && <th className="p-3.5">Employee</th>}
                    {isFieldVisible('working_hours', 'department') && <th className="p-3.5">Department</th>}
                    {isFieldVisible('working_hours', 'expected') && <th className="p-3.5 text-center">Expected</th>}
                    {isFieldVisible('working_hours', 'logged') && <th className="p-3.5 text-center">Logged</th>}
                    {isFieldVisible('working_hours', 'overtime') && <th className="p-3.5 text-center">Overtime</th>}
                    {isFieldVisible('working_hours', 'deficit') && <th className="p-3.5 text-center">Deficit</th>}
                    {isFieldVisible('working_hours', 'status') && <th className="p-3.5 text-right">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="p-8 text-center text-slate-400">
                        No employees found.
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployees.map((emp) => {
                      const stats = employeeStatsMap.get(emp.id);
                      const exp = scheduledDays * hoursPerDay;
                      const logged = stats?.loggedHours || 0;
                      const ot = Math.max(0, logged - exp);
                      const def = Math.max(0, exp - logged);
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/70">
                          {isFieldVisible('working_hours', 'employee') && (
                            <td className="p-3.5 font-bold text-slate-900">{emp.name}</td>
                          )}
                          {isFieldVisible('working_hours', 'department') && (
                            <td className="p-3.5 text-slate-600">{emp.department || 'Operations'}</td>
                          )}
                          {isFieldVisible('working_hours', 'expected') && (
                            <td className="p-3.5 text-center font-mono">{exp.toFixed(1)}h</td>
                          )}
                          {isFieldVisible('working_hours', 'logged') && (
                            <td className="p-3.5 text-center font-mono font-bold text-blue-600">{logged.toFixed(1)}h</td>
                          )}
                          {isFieldVisible('working_hours', 'overtime') && (
                            <td className="p-3.5 text-center font-mono text-emerald-600 font-bold">
                              +{ot}.0h
                            </td>
                          )}
                          {isFieldVisible('working_hours', 'deficit') && (
                            <td className="p-3.5 text-center font-mono text-slate-400">-{def}.0h</td>
                          )}
                          {isFieldVisible('working_hours', 'status') && (
                            <td className="p-3.5 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  stats?.status === 'Target Met'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : stats?.status === 'In Progress'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {stats?.status || 'No Activity'}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. MUSTER REPORT */}
          {selectedReport === 'muster_report' && (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 select-none">
                  <tr>
                    {isFieldVisible('muster_report', 'employee') && <th className="p-3.5">Employee</th>}
                    {isFieldVisible('muster_report', 'department') && <th className="p-3.5">Dept</th>}
                    {Array.from({ length: Math.min(15, daysInMonth) }, (_, i) => (
                      <th key={i} className="p-1.5 text-center font-mono">
                        {i + 1}
                      </th>
                    ))}
                    {isFieldVisible('muster_report', 'presentDays') && <th className="p-3.5 text-center">P</th>}
                    {isFieldVisible('muster_report', 'leaveDays') && <th className="p-3.5 text-center">L</th>}
                    {isFieldVisible('muster_report', 'payableDays') && <th className="p-3.5 text-right">Payable</th>}
                    {isFieldVisible('muster_report', 'attendanceHealth') && <th className="p-3.5 text-right">Health</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={25} className="p-8 text-center text-slate-400">
                        No employees found.
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployees.map((emp) => {
                      const stats = employeeStatsMap.get(emp.id);
                      const pCount = stats?.presentDays || 0;
                      const lCount = stats?.leaveDays || 0;
                      const empPunches = monthAttendance.filter(
                        (a) => a.employeeId === emp.id || (emp.employeeId && a.employeeId === emp.employeeId) || a.employeeName === emp.name
                      );

                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/70">
                          {isFieldVisible('muster_report', 'employee') && (
                            <td className="p-3.5 font-bold text-slate-900 truncate max-w-[120px]">{emp.name}</td>
                          )}
                          {isFieldVisible('muster_report', 'department') && (
                            <td className="p-3.5 text-slate-500 text-[11px]">{emp.department || 'Gen'}</td>
                          )}
                          {Array.from({ length: Math.min(15, daysInMonth) }, (_, i) => {
                            const dayNum = i + 1;
                            const dateStr = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
                            const isWeekend = new Date(year, month - 1, dayNum).getDay() === 0 || new Date(year, month - 1, dayNum).getDay() === 6;
                            const hasPunch = empPunches.some((p) => p.date === dateStr);

                            let code = '—';
                            if (isWeekend) {
                              code = 'WO';
                            } else if (hasPunch) {
                              code = 'P';
                            } else {
                              code = 'A';
                            }

                            return (
                              <td key={i} className="p-1.5 text-center font-mono text-[10px]">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold border ${
                                    code === 'WO'
                                      ? 'text-slate-500 bg-slate-100 border-slate-200'
                                      : code === 'P'
                                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                      : 'text-slate-400 border-transparent'
                                  }`}
                                >
                                  {code}
                                </span>
                              </td>
                            );
                          })}
                          {isFieldVisible('muster_report', 'presentDays') && (
                            <td className="p-3.5 text-center font-mono font-bold text-emerald-600">{pCount}</td>
                          )}
                          {isFieldVisible('muster_report', 'leaveDays') && (
                            <td className="p-3.5 text-center font-mono text-blue-600">{lCount}</td>
                          )}
                          {isFieldVisible('muster_report', 'payableDays') && (
                            <td className="p-3.5 text-right font-mono font-bold text-slate-900">
                              {pCount + lCount}
                            </td>
                          )}
                          {isFieldVisible('muster_report', 'attendanceHealth') && (
                            <td className="p-3.5 text-right">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  stats && stats.attendanceRate >= 90
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : stats && stats.attendanceRate >= 75
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {stats && stats.attendanceRate >= 90 ? 'Excellent' : stats && stats.attendanceRate >= 75 ? 'Good' : 'Needs Attention'}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 6. LEAVE TAKEN REPORT */}
          {selectedReport === 'leave_taken' && (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 select-none">
                  <tr>
                    {isFieldVisible('leave_taken', 'employee') && <th className="p-3.5">Employee Name</th>}
                    {isFieldVisible('leave_taken', 'leaveType') && <th className="p-3.5">Leave Category</th>}
                    {isFieldVisible('leave_taken', 'duration') && <th className="p-3.5">Duration Window</th>}
                    {isFieldVisible('leave_taken', 'days') && <th className="p-3.5 text-center">Days</th>}
                    {isFieldVisible('leave_taken', 'reason') && <th className="p-3.5">Purpose / Reason</th>}
                    {isFieldVisible('leave_taken', 'status') && <th className="p-3.5 text-right">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {monthLeaves.length === 0 ? (
                    <tr>
                      <td colSpan={20} className="p-8 text-center text-slate-400">
                        No leave applications recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    paginatedLeaves.map((l) => (
                      <tr key={l.id} className="hover:bg-slate-50/70">
                        {isFieldVisible('leave_taken', 'employee') && (
                          <td className="p-3.5 font-bold text-slate-900">{l.employeeName}</td>
                        )}
                        {isFieldVisible('leave_taken', 'leaveType') && (
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              {l.leaveType}
                            </span>
                          </td>
                        )}
                        {isFieldVisible('leave_taken', 'duration') && (
                          <td className="p-3.5 font-mono text-slate-500">
                            {l.startDate} to {l.endDate}
                          </td>
                        )}
                        {isFieldVisible('leave_taken', 'days') && (
                          <td className="p-3.5 text-center font-mono font-bold text-slate-800">
                            {l.daysCount || 1}
                          </td>
                        )}
                        {isFieldVisible('leave_taken', 'reason') && (
                          <td className="p-3.5 text-slate-600 max-w-xs truncate">{l.reason}</td>
                        )}
                        {isFieldVisible('leave_taken', 'status') && (
                          <td className="p-3.5 text-right">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                l.status === 'Approved'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : l.status === 'Rejected'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {l.status}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* 7. EMPLOYEE DAY-WISE MASTER */}
          {selectedReport === 'day_wise_master' && (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold uppercase text-[10px] border-b border-slate-200 select-none">
                  <tr>
                    {isFieldVisible('day_wise_master', 'date') && <th className="p-3.5">Date</th>}
                    <th className="p-3.5">Day</th>
                    <th className="p-3.5">Shift Assigned</th>
                    {isFieldVisible('day_wise_master', 'checkIn') && <th className="p-3.5">Clock In</th>}
                    {isFieldVisible('day_wise_master', 'checkOut') && <th className="p-3.5">Clock Out</th>}
                    {isFieldVisible('day_wise_master', 'hours') && <th className="p-3.5 text-center">Net Working Hours</th>}
                    {isFieldVisible('day_wise_master', 'status') && <th className="p-3.5 text-right">Status</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {!activeEmp ? (
                    <tr>
                      <td colSpan={20} className="p-8 text-center text-slate-400">
                        Please select an employee to view day-wise logs.
                      </td>
                    </tr>
                  ) : (
                    Array.from({ length: daysInMonth }, (_, i) => {
                      const dayNum = i + 1;
                      const dateStr = `${selectedMonth}-${String(dayNum).padStart(2, '0')}`;
                      const dayDate = new Date(year, month - 1, dayNum);
                      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
                      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                      const dayName = dayNames[dayDate.getDay()];

                      const today = new Date();
                      const todayYear = today.getFullYear();
                      const todayMonth = today.getMonth() + 1;
                      const todayDay = today.getDate();
                      const todayStr = `${todayYear}-${String(todayMonth).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;
                      const isFuture = dateStr > todayStr;
                      const joinDate = activeEmp.joiningDate || activeEmp.joinDate || (activeEmp as any).dateOfJoining;
                      const isBeforeJoining = joinDate ? dateStr < joinDate.substring(0, 10) : false;

                      const empPunches = monthAttendance.filter(
                        (a) =>
                          a.employeeId === activeEmp.id ||
                          (activeEmp.employeeId && a.employeeId === activeEmp.employeeId) ||
                          a.employeeName === activeEmp.name
                      );
                      const punch = empPunches.find((p) => p.date === dateStr);

                      // Status & hours logic
                      let displayStatus = 'Absent';
                      let statusBadgeClass = 'text-rose-700 bg-rose-50 border-rose-200';
                      let hoursText = '0h';

                      if (isWeekend) {
                        displayStatus = 'Weekly Off';
                        statusBadgeClass = 'text-slate-600 bg-slate-100 border-slate-200';
                        hoursText = punch ? `${punch.workingHours || 8}h` : '—';
                      } else if (punch) {
                        displayStatus = punch.status || 'Present';
                        statusBadgeClass =
                          punch.status === 'Late'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : punch.status === 'On Leave'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : punch.status === 'Work From Home'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200';
                        hoursText = `${punch.workingHours || 8}h`;
                      } else if (isBeforeJoining) {
                        displayStatus = 'Not Joined';
                        statusBadgeClass = 'text-slate-500 bg-slate-100 border-slate-200';
                        hoursText = '—';
                      } else if (isFuture) {
                        displayStatus = 'Scheduled';
                        statusBadgeClass = 'text-slate-500 bg-slate-100 border-slate-200';
                        hoursText = '—';
                      } else {
                        // Past weekday with no punch record
                        displayStatus = 'Absent';
                        statusBadgeClass = 'text-rose-700 bg-rose-50 border-rose-200';
                        hoursText = '0h';
                      }

                      return (
                        <tr key={dateStr} className="hover:bg-slate-50/70">
                          {isFieldVisible('day_wise_master', 'date') && (
                            <td className="p-3.5 font-mono font-bold text-slate-900">{dateStr}</td>
                          )}
                          <td className="p-3.5 text-slate-500">{dayName}</td>
                          <td className="p-3.5 text-slate-600">
                            {isWeekend ? 'Weekly Off' : activeEmp.workSchedule?.name || 'General Shift (9:00 - 18:00)'}
                          </td>
                          {isFieldVisible('day_wise_master', 'checkIn') && (
                            <td className="p-3.5 font-mono text-slate-800">
                              {punch?.checkIn || '—'}
                            </td>
                          )}
                          {isFieldVisible('day_wise_master', 'checkOut') && (
                            <td className="p-3.5 font-mono text-slate-800">
                              {punch?.checkOut || '—'}
                            </td>
                          )}
                          {isFieldVisible('day_wise_master', 'hours') && (
                            <td className="p-3.5 text-center font-mono font-bold text-blue-600">
                              {hoursText}
                            </td>
                          )}
                          {isFieldVisible('day_wise_master', 'status') && (
                            <td className="p-3.5 text-right">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusBadgeClass}`}>
                                {displayStatus}
                              </span>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Table Pagination Footer */}
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            Showing{' '}
            <span className="font-semibold text-slate-800">
              {tableRowCount === 0
                ? 0
                : Math.min((currentPage - 1) * rowsPerPage + 1, tableRowCount)}
              –
              {Math.min(currentPage * rowsPerPage, tableRowCount)}
            </span>{' '}
            of <span className="font-semibold text-slate-800">{tableRowCount}</span> entries
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors shadow-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <span className="px-3 py-1 text-xs font-semibold text-slate-700">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="h-8 w-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed transition-colors shadow-xs"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
};

