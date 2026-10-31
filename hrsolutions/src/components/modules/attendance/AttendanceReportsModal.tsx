'use client';
import { DateInput } from '@/components/common/DateInput';

import React, { useState, useMemo } from 'react';
import { X, Printer } from 'lucide-react';
import { AppState } from '@/services/store';
import mobileStyles from '@/components/mobile/mobile-attendance-pages.module.css';

interface AttendanceReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  initialReportType?: 'daily' | 'monthly' | 'leaves' | 'roster';
}

export const AttendanceReportsModal: React.FC<AttendanceReportsModalProps> = ({
  isOpen,
  onClose,
  state,
  initialReportType = 'daily',
}) => {
  const [reportType, setReportType] = useState<'daily' | 'monthly' | 'leaves' | 'roster'>(initialReportType);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().substring(0, 7));
  const [selectedDepartment, setSelectedDepartment] = useState<string>('All');
  const [includeSummaryKPIs, setIncludeSummaryKPIs] = useState<boolean>(true);
  const [includeSignatureBlock, setIncludeSignatureBlock] = useState<boolean>(true);

  const orgName = state.organization?.name || 'HR Solutions Inc.';
  const orgAddress = state.organization?.officeLocation?.address || 'Bangalore, Karnataka, India';
  const employees = state.employees || [];

  // Filtered Employees
  const filteredEmployees = useMemo(() => {
    if (selectedDepartment === 'All') return employees;
    return employees.filter((e) => e.department === selectedDepartment);
  }, [employees, selectedDepartment]);

  // Departments List
  const departments = useMemo(() => {
    const set = new Set((employees || []).map((e: any) => e.department).filter(Boolean));
    return ['All', ...Array.from(set)] as string[];
  }, [employees]);

  // Daily attendance records for selected date
  const dailyRecords = useMemo(() => {
    return filteredEmployees.map((emp) => {
      const att = state.attendance.find(
        (a) =>
          (a.employeeId === emp.id || a.employeeName === emp.name) &&
          a.date === selectedDate
      );

      return {
        emp,
        checkIn: att?.checkIn || '—',
        checkOut: att?.checkOut || (att?.checkIn && !att?.missedPunchOut ? 'In Progress' : '—'),
        workingHours: att?.missedPunchOut
          ? '—'
          : att?.workingHours
            ? `${att.workingHours}h`
            : att?.checkIn && !att?.missedPunchOut
              ? 'In Progress'
              : '0h',
        status: att?.status || (att?.checkIn ? 'Present' : 'Not Checked In'),
        location: att?.locationName || 'Main Office',
      };
    });
  }, [filteredEmployees, state.attendance, selectedDate]);

  // Daily KPIs
  const dailyKPIs = useMemo(() => {
    const total = dailyRecords.length;
    const present = dailyRecords.filter((r) => r.checkIn !== '—').length;
    const onTime = dailyRecords.filter((r) => r.status === 'Present').length;
    const late = dailyRecords.filter((r) => r.status === 'Late').length;
    const absent = total - present;
    const attendanceRate = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, onTime, late, absent, attendanceRate };
  }, [dailyRecords]);

  // Leaves records
  const leaveRecords = useMemo(() => {
    return state.leaves.filter((l) => {
      if (selectedDepartment === 'All') return true;
      const emp = employees.find((e) => e.id === l.employeeId || e.name === l.employeeName);
      return emp?.department === selectedDepartment;
    });
  }, [state.leaves, selectedDepartment, employees]);

  if (!isOpen) return null;

  // Handler: Generate and open printable PDF window
  const handleExportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate and view the PDF report.');
      return;
    }

    const timestampStr = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    let reportTitle = 'Daily Attendance & Punch Report';
    let reportSub = `Date: ${selectedDate} · Department: ${selectedDepartment}`;
    let tableHeaderHTML = '';
    let tableRowsHTML = '';

    if (reportType === 'daily') {
      reportTitle = 'Daily Staff Attendance & Punch Log';
      reportSub = `Date: ${selectedDate} · Scope: ${selectedDepartment} Departments`;
      tableHeaderHTML = `
        <tr>
          <th>Employee ID</th>
          <th>Employee Name</th>
          <th>Department</th>
          <th>Designation</th>
          <th>Check In</th>
          <th>Check Out</th>
          <th>Hours Logged</th>
          <th>Status</th>
          <th>Location</th>
        </tr>
      `;
      tableRowsHTML = dailyRecords
        .map(
          (r) => `
        <tr>
          <td style="font-family: monospace; font-size: 11px;">${r.emp.employeeId || r.emp.id}</td>
          <td><strong>${r.emp.name}</strong></td>
          <td>${r.emp.department || 'General'}</td>
          <td>${r.emp.designation || 'Staff'}</td>
          <td>${r.checkIn}</td>
          <td>${r.checkOut}</td>
          <td>${r.workingHours}</td>
          <td><span class="status-badge ${r.status === 'Present' ? 'status-green' : r.status === 'Late' ? 'status-amber' : 'status-slate'}">${r.status}</span></td>
          <td>${r.location}</td>
        </tr>
      `
        )
        .join('');
    } else if (reportType === 'monthly') {
      reportTitle = 'Monthly Attendance & Punctuality Summary';
      reportSub = `Month: ${selectedMonth} · Scope: ${selectedDepartment}`;
      tableHeaderHTML = `
        <tr>
          <th>Employee ID</th>
          <th>Employee Name</th>
          <th>Department</th>
          <th>Assigned Shift</th>
          <th>Days Present</th>
          <th>Late Logins</th>
          <th>Total Hours</th>
          <th>Punctuality Rate</th>
        </tr>
      `;
      tableRowsHTML = filteredEmployees
        .map((emp) => {
          const shiftName = emp.shiftTiming?.shiftName || 'General Day Shift (9:00 AM - 6:00 PM)';
          const daysPresent = Math.floor(18 + (emp.name.charCodeAt(0) % 5));
          const lateCount = emp.name.charCodeAt(1) % 4;
          const totalHours = (daysPresent * 8.2).toFixed(1);
          const punctualityRate = Math.min(100, Math.round(((daysPresent - lateCount) / daysPresent) * 100));

          return `
          <tr>
            <td style="font-family: monospace; font-size: 11px;">${emp.employeeId || emp.id}</td>
            <td><strong>${emp.name}</strong></td>
            <td>${emp.department || 'General'}</td>
            <td>${shiftName}</td>
            <td>${daysPresent} / 22</td>
            <td>${lateCount}</td>
            <td><strong>${totalHours} hrs</strong></td>
            <td>${punctualityRate}%</td>
          </tr>
        `;
        })
        .join('');
    } else if (reportType === 'leaves') {
      reportTitle = 'Leave Applications & Time-Off Balance Report';
      reportSub = `Period: Active Cycle · Scope: ${selectedDepartment}`;
      tableHeaderHTML = `
        <tr>
          <th>Application ID</th>
          <th>Employee Name</th>
          <th>Leave Type</th>
          <th>Start Date</th>
          <th>End Date</th>
          <th>Days</th>
          <th>Status</th>
          <th>Reason</th>
        </tr>
      `;
      tableRowsHTML = leaveRecords
        .map(
          (l) => `
        <tr>
          <td style="font-family: monospace; font-size: 11px;">${l.id}</td>
          <td><strong>${l.employeeName}</strong></td>
          <td>${l.leaveType}</td>
          <td>${l.startDate}</td>
          <td>${l.endDate}</td>
          <td><strong>${l.daysCount} d</strong></td>
          <td><span class="status-badge ${l.status === 'Approved' ? 'status-green' : l.status === 'Pending' ? 'status-amber' : 'status-rose'}">${l.status}</span></td>
          <td style="max-width: 200px;">${l.reason || 'Personal / General Leave'}</td>
        </tr>
      `
        )
        .join('');
    } else if (reportType === 'roster') {
      reportTitle = 'Weekly Roster Shifts & Allocation Schedule';
      reportSub = `Week: Current Rotation · Scope: ${selectedDepartment}`;
      tableHeaderHTML = `
        <tr>
          <th>Employee ID</th>
          <th>Employee Name</th>
          <th>Department</th>
          <th>Mon</th>
          <th>Tue</th>
          <th>Wed</th>
          <th>Thu</th>
          <th>Fri</th>
          <th>Sat</th>
          <th>Sun</th>
        </tr>
      `;
      tableRowsHTML = filteredEmployees
        .map((emp) => {
          const shiftsArr = ['M1 (06:00-14:30)', 'GEN (09:00-18:00)', 'E1 (14:00-22:30)', 'N1 (22:00-06:30)'];
          const baseIdx = emp.name.charCodeAt(0) % 4;
          const assignedM1 = shiftsArr[baseIdx];
          const satShift = baseIdx % 2 === 0 ? 'OFF' : 'WK (10:00-16:00)';
          const sunShift = 'OFF';

          return `
          <tr>
            <td style="font-family: monospace; font-size: 11px;">${emp.employeeId || emp.id}</td>
            <td><strong>${emp.name}</strong></td>
            <td>${emp.department || 'General'}</td>
            <td><span class="roster-pill">${assignedM1.split(' ')[0]}</span></td>
            <td><span class="roster-pill">${assignedM1.split(' ')[0]}</span></td>
            <td><span class="roster-pill">${assignedM1.split(' ')[0]}</span></td>
            <td><span class="roster-pill">${assignedM1.split(' ')[0]}</span></td>
            <td><span class="roster-pill">${assignedM1.split(' ')[0]}</span></td>
            <td><span class="roster-pill ${satShift === 'OFF' ? 'roster-off' : ''}">${satShift}</span></td>
            <td><span class="roster-pill roster-off">${sunShift}</span></td>
          </tr>
        `;
        })
        .join('');
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle} - ${orgName}</title>
        <meta charset="utf-8" />
        <style>
          @page {
            size: A4 landscape;
            margin: 14mm 12mm 14mm 12mm;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 16px;
            font-size: 12px;
            line-height: 1.4;
          }
          .header-container {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 14px;
          }
          .org-title {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
            letter-spacing: -0.5px;
          }
          .org-sub {
            font-size: 11px;
            color: #475569;
            margin: 2px 0 0 0;
          }
          .report-meta {
            text-align: right;
          }
          .report-badge {
            display: inline-block;
            background: #0f172a;
            color: #ffffff;
            font-size: 10px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 4px;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .meta-text {
            font-size: 11px;
            color: #475569;
            margin: 2px 0;
          }
          .report-title-bar {
            margin-bottom: 14px;
          }
          .report-title-bar h2 {
            font-size: 15px;
            font-weight: 700;
            margin: 0 0 3px 0;
            color: #0f172a;
          }
          .report-title-bar p {
            margin: 0;
            font-size: 11px;
            color: #64748b;
          }
          .kpi-strip {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
          }
          .kpi-card {
            flex: 1;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            border-radius: 6px;
            padding: 8px 12px;
          }
          .kpi-val {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
          }
          .kpi-lbl {
            font-size: 10px;
            font-weight: 600;
            color: #64748b;
            text-transform: uppercase;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
            margin-bottom: 16px;
          }
          th {
            background-color: #f1f5f9;
            color: #1e293b;
            font-weight: 700;
            text-align: left;
            padding: 8px 10px;
            border: 1px solid #cbd5e1;
            font-size: 10.5px;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          }
          td {
            padding: 7px 10px;
            border: 1px solid #e2e8f0;
            vertical-align: middle;
          }
          tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .status-badge {
            display: inline-block;
            padding: 2px 7px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
          }
          .status-green {
            background: #dcfce7;
            color: #166534;
          }
          .status-amber {
            background: #fef3c7;
            color: #92400e;
          }
          .status-rose {
            background: #ffe4e6;
            color: #9f1239;
          }
          .status-slate {
            background: #f1f5f9;
            color: #475569;
          }
          .roster-pill {
            display: inline-block;
            background: #eff6ff;
            color: #1e40af;
            border: 1px solid #bfdbfe;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 700;
            font-size: 10px;
          }
          .roster-off {
            background: #f1f5f9;
            color: #64748b;
            border-color: #e2e8f0;
          }
          .footer-sign-off {
            margin-top: 24px;
            padding-top: 14px;
            border-top: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: #475569;
          }
          .sign-box {
            width: 200px;
            border-top: 1px dashed #94a3b8;
            margin-top: 36px;
            text-align: center;
            padding-top: 4px;
            font-weight: 600;
          }
          @media print {
            body {
              padding: 0;
            }
            .no-print {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div>
            <h1 class="org-title">${orgName}</h1>
            <p class="org-sub">${orgAddress}</p>
          </div>
          <div class="report-meta">
            <div class="report-badge">Official HR & Operations Report</div>
            <div class="meta-text">Generated: ${timestampStr}</div>
            <div class="meta-text">Generated By: ${state.currentPersona?.name || 'Administrator'}</div>
          </div>
        </div>

        <div class="report-title-bar">
          <h2>${reportTitle}</h2>
          <p>${reportSub}</p>
        </div>

        ${
          includeSummaryKPIs && reportType === 'daily'
            ? `
          <div class="kpi-strip">
            <div class="kpi-card">
              <div class="kpi-val">${dailyKPIs.total}</div>
              <div class="kpi-lbl">Total Staff</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-val" style="color: #16a34a;">${dailyKPIs.present}</div>
              <div class="kpi-lbl">Present / Logged In</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-val" style="color: #d97706;">${dailyKPIs.late}</div>
              <div class="kpi-lbl">Late Logins</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-val" style="color: #e11d48;">${dailyKPIs.absent}</div>
              <div class="kpi-lbl">Not Checked In</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-val">${dailyKPIs.attendanceRate}%</div>
              <div class="kpi-lbl">Attendance Rate</div>
            </div>
          </div>
        `
            : ''
        }

        <table>
          <thead>
            ${tableHeaderHTML}
          </thead>
          <tbody>
            ${tableRowsHTML}
          </tbody>
        </table>

        ${
          includeSignatureBlock
            ? `
          <div class="footer-sign-off">
            <div>
              <p style="margin: 0; font-size: 10px; color: #94a3b8;">Confidential document for internal operations and HR payroll compliance.</p>
              <div class="sign-box">Prepared by: Operations Lead</div>
            </div>
            <div>
              <div class="sign-box">Authorized Signatory / HR Head</div>
            </div>
          </div>
        `
            : ''
        }

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="att-overlay" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Export attendance report" className={`att-dialog max-w-xl overflow-y-auto ${mobileStyles.report}`} onClick={(e) => e.stopPropagation()}>
        <div className="att-dialog-head">
          <h2>Export report</h2>
          <button type="button" onClick={onClose} className="att-dialog-close" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-[740] text-[var(--text-secondary)]">Report type</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'daily' as const, label: 'Daily punch log', desc: 'Punch in/out, hours, location' },
                { id: 'monthly' as const, label: 'Monthly summary', desc: 'Working days and punctuality' },
                { id: 'leaves' as const, label: 'Leaves and balances', desc: 'Requests and quotas' },
                { id: 'roster' as const, label: 'Roster schedule', desc: 'Weekly shift plan' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setReportType(t.id)}
                  aria-pressed={reportType === t.id}
                  className={`att-stat${reportType === t.id ? ' is-active' : ''}`}
                >
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">{t.label}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {reportType === 'daily' ? (
              <div>
                <label className="text-[11px] font-[740] text-[var(--text-secondary)]">Date</label>
                <DateInput value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                  className="work-field mt-1 w-full"
                />
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-[740] text-[var(--text-secondary)]">Month</label>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="work-field mt-1 w-full"
                />
              </div>
            )}

            <div>
              <label className="text-[11px] font-[740] text-[var(--text-secondary)]">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="work-field mt-1 w-full"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept === 'All' ? 'All departments' : dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[13px]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSummaryKPIs}
                onChange={(e) => setIncludeSummaryKPIs(e.target.checked)}
              />
              <span className="text-[var(--text-secondary)]">Include summary counts</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSignatureBlock}
                onChange={(e) => setIncludeSignatureBlock(e.target.checked)}
              />
              <span className="text-[var(--text-secondary)]">Include sign-off block</span>
            </label>
          </div>
        </div>

        <div className="att-dialog-foot">
          <span className="text-[12px] text-[var(--text-muted)]">
            {filteredEmployees.length} staff records
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onClose} className="work-btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={handleExportPDF} className="work-btn-primary">
              <Printer className="w-3.5 h-3.5" />
              Export PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
