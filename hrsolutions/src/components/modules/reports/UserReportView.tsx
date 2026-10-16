'use client';

import React, { useState } from 'react';
import { UserReport } from '@/utils/userReport';
import { downloadUserReportPdf, downloadUserReportXlsx } from '@/utils/userReportExport';

const inr = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value) || 0
  );

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="people-studio__empty">{children}</div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="people-studio__sheet people-studio__dept">
      <div className="people-studio__dept-head">
        <h2 className="people-studio__dept-name">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function UserReportView({
  report,
  organizationName,
  showExport = true,
}: {
  report: UserReport;
  organizationName: string;
  showExport?: boolean;
}) {
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);

  const exportPdf = async () => {
    setExporting('pdf');
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      downloadUserReportPdf(report, organizationName);
    } finally {
      setExporting(null);
    }
  };

  const exportXlsx = async () => {
    setExporting('xlsx');
    try {
      await downloadUserReportXlsx(report, organizationName);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="people-studio__title">{report.name}</h2>
          <p className="people-studio__meta mt-1">
            {[report.employeeCode, report.designation, report.department, report.payrollGroup, report.salaryType]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {showExport ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportXlsx()}
              disabled={Boolean(exporting)}
              className="people-studio__btn people-studio__btn--secondary"
            >
              {exporting === 'xlsx' ? 'Preparing Excel' : 'Export Excel'}
            </button>
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={Boolean(exporting)}
              className="people-studio__btn people-studio__btn--primary"
            >
              {exporting === 'pdf' ? 'Preparing PDF' : 'Download PDF'}
            </button>
          </div>
        ) : null}
      </div>

      <div className="people-studio__kpis">
        {[
          { label: 'Present days', value: String(report.presentDays), note: `${report.lateDays} late · ${report.wfhDays} WFH` },
          { label: 'Work hours', value: report.hoursWorked.toFixed(1), note: report.hoursRequired ? `${report.hoursRequired} required` : `${report.attendanceHours} from attendance` },
          { label: 'Leaves', value: String(report.leaveDays), note: `${report.leaves.length} requests` },
          { label: 'LOP', value: `${report.lopDays}d`, note: report.lopAmount ? inr(report.lopAmount) : `${report.absentDays} absent` },
        ].map((item) => (
          <div key={item.label} className="people-studio__sheet people-studio__kpi">
            <p className="people-studio__kpi-label">{item.label}</p>
            <p className="people-studio__kpi-value">{item.value}</p>
            <p className="people-studio__kpi-note">{item.note}</p>
          </div>
        ))}
      </div>

      <Section title="Attendance">
        {report.attendance.length ? (
          <div className="people-studio__table-wrap">
            <table>
              <thead>
                <tr>
                  {['Date', 'In', 'Out', 'Hours', 'Status'].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.attendance.map((row) => (
                  <tr key={row.date}>
                    <td className="people-studio__role">{row.date}</td>
                    <td className="people-studio__quiet">{row.checkIn}</td>
                    <td className="people-studio__quiet">{row.checkOut}</td>
                    <td>{row.hours.toFixed(1)}</td>
                    <td>
                      <span className="people-studio__status people-studio__status--wait">{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No attendance records for this period.</Empty>
        )}
      </Section>

      <Section title="Tasks">
        {report.tasks.length ? (
          <div className="people-studio__table-wrap">
            <table>
              <thead>
                <tr>
                  {['Task', 'Project', 'Status', 'Due', 'Hours'].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.tasks.map((row) => (
                  <tr key={row.id}>
                    <td className="people-studio__role">{row.title}</td>
                    <td className="people-studio__quiet">{row.project}</td>
                    <td>
                      <span className={`people-studio__status ${row.overdue ? 'people-studio__status--wait' : 'people-studio__status--ok'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="people-studio__quiet">{row.dueDate}</td>
                    <td>
                      {row.actualHours.toFixed(1)} / {row.estimatedHours.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No tasks assigned in this workspace.</Empty>
        )}
      </Section>

      <div className="people-studio__split people-studio__split--8-4">
        <Section title="Leaves">
          {report.leaves.length ? (
            <div className="people-studio__table-wrap">
              <table>
                <thead>
                  <tr>
                    {['Type', 'Dates', 'Days', 'Status'].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.leaves.map((row) => (
                    <tr key={row.id}>
                      <td className="people-studio__role">{row.type}</td>
                      <td className="people-studio__quiet">
                        {row.startDate} – {row.endDate}
                      </td>
                      <td>{row.days}</td>
                      <td>
                        {row.status}
                        {row.paid ? '' : ' · LOP'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No leave requests for this period.</Empty>
          )}
        </Section>
        <Section title="Leave balances">
          <dl className="people-studio__scope">
            {report.leaveBalances.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.remaining}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      {report.payroll.available ? (
        <Section title="Payroll">
          <dl className="people-studio__scope mb-4">
            <div>
              <dt>Hours / days</dt>
              <dd>
                {report.daysWorked}/{report.daysRequired || '—'}d · {report.hoursWorked}/{report.hoursRequired || '—'}h
              </dd>
            </div>
            <div>
              <dt>Gross</dt>
              <dd>{inr(report.payroll.gross)}</dd>
            </div>
            <div>
              <dt>Incentives</dt>
              <dd>{inr(report.payroll.incentives)}</dd>
            </div>
            <div>
              <dt>Deductions</dt>
              <dd>{inr(report.payroll.deductions)}</dd>
            </div>
            <div>
              <dt>LOP</dt>
              <dd>
                {report.lopDays}d · {inr(report.lopAmount)}
              </dd>
            </div>
            <div>
              <dt>Net</dt>
              <dd>{inr(report.payroll.net)}</dd>
            </div>
          </dl>
          {report.payroll.deductionLines.length || report.payroll.incentiveItems.length ? (
            <div className="people-studio__table-wrap">
              <table>
                <thead>
                  <tr>
                    {['Line', 'Type', 'Amount'].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.payroll.deductionLines.map((item) => (
                    <tr key={`d-${item.name}`}>
                      <td className="people-studio__role">{item.name}</td>
                      <td className="people-studio__quiet">Deduction</td>
                      <td>{inr(item.amount)}</td>
                    </tr>
                  ))}
                  {report.payroll.incentiveItems.map((item) => (
                    <tr key={`i-${item.type}-${item.reason}`}>
                      <td className="people-studio__role">{item.reason}</td>
                      <td className="people-studio__quiet">{item.type}</td>
                      <td>{inr(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </Section>
      ) : (
        <Section title="Work hours">
          <dl className="people-studio__scope">
            <div>
              <dt>Attendance hours</dt>
              <dd>{report.attendanceHours.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Timesheet hours</dt>
              <dd>{report.timesheetHours.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Task hours</dt>
              <dd>{report.taskHours.toFixed(1)}</dd>
            </div>
            <div>
              <dt>Tasks</dt>
              <dd>
                {report.completedTasks} completed · {report.overdueTasks} overdue
              </dd>
            </div>
          </dl>
        </Section>
      )}
    </div>
  );
}
