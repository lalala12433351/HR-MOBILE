'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { isInstitutionMode } from '@/utils/organizationMode';

export const MetricCards: React.FC = () => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const employees = dashboardState.employees || [];
  const students = dashboardState.students || [];
  const attendance = dashboardState.attendance || [];
  const leaves = dashboardState.leaves || [];
  const projects = dashboardState.projects || [];

  const isInstitution = isInstitutionMode(state.organization, state.currentPersona);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayPunches = attendance.filter((a) => a.date === todayStr);
  const presentEmployeesCount = new Set(
    todayPunches
      .filter((a) => a.status === 'Present' || a.status === 'Late' || a.status === 'Work From Home')
      .map((a) => a.employeeId)
  ).size;

  const totalMembers = isInstitution ? students.length + employees.length : employees.length;
  const attendanceRate =
    totalMembers > 0
      ? Math.min(100, Math.round((presentEmployeesCount / totalMembers) * 100))
      : 0;

  const approvedLeaves = leaves.filter((l) => l.status === 'Approved').length;
  const pendingLeaves = leaves.filter((l) => l.status === 'Pending').length;
  const activeProjects = projects.filter((p) => p.status === 'In Progress' || !p.status).length;
  const academicBatchesCount =
    state.customOptions?.academicBatches?.length ||
    new Set(students.map((s) => s.grade || s.section).filter(Boolean)).size;

  const cardClass =
    'dash-card dash-surface p-4 sm:p-5 min-h-[7.5rem] text-left flex flex-col justify-between gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--primary-blue)_35%,transparent)]';

  return (
    <section
      aria-label="Organization Metrics"
      className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5"
    >
      <button
        type="button"
        onClick={() => router.push(isInstitution ? '/student-directory' : '/hr')}
        className={cardClass}
        data-purpose="stat-card"
      >
        <div>
          <span className="dash-kpi-label block text-pretty">
            {isInstitution ? 'Enrolled Students' : 'Total Employees'}
          </span>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="dash-kpi">
              {isInstitution ? students.length : employees.length}
            </span>
            {!isInstitution && (
              <span className="text-sm font-semibold text-[var(--text-muted)]">Employees</span>
            )}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => router.push('/attendance')}
        className={cardClass}
        data-purpose="stat-card"
      >
        <div>
          <span className="dash-kpi-label block">
            {isInstitution ? 'Class Attendance' : 'Attendance'}
          </span>
          <div className="mt-2.5 flex items-baseline gap-1">
            <span className="dash-kpi">{attendanceRate}</span>
            <span className="text-sm font-semibold text-[var(--text-muted)]">% Present</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => router.push(isInstitution ? '/hr' : '/leaves')}
        className={cardClass}
        data-purpose="stat-card"
      >
        <div>
          <span className="dash-kpi-label block">
            {isInstitution ? 'Staff & Faculty' : 'Leave Requests'}
          </span>
          <div className="mt-2.5 flex items-baseline">
            {isInstitution ? (
              <span className="dash-kpi">{employees.length}</span>
            ) : (
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 leading-none tabular-nums">
                  {approvedLeaves}
                </span>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Approved
                </span>
                <span className="text-[var(--text-muted)] mx-0.5 font-normal">/</span>
                <span className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-400 leading-none tabular-nums">
                  {pendingLeaves}
                </span>
                <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  Pending
                </span>
              </div>
            )}
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => router.push(isInstitution ? '/setup-students' : '/projects')}
        className={cardClass}
        data-purpose="stat-card"
      >
        <div>
          <span className="dash-kpi-label block">
            {isInstitution ? 'Academic Batches' : 'Active Projects'}
          </span>
          <div className="mt-2.5 flex items-baseline">
            <span className="dash-kpi">
              {isInstitution ? academicBatchesCount : activeProjects}
            </span>
          </div>
        </div>
      </button>
    </section>
  );
};
