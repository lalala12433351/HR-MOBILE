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

  const lead = {
    label: isInstitution ? 'Class attendance today' : 'Attendance today',
    value: attendanceRate,
    suffix: '%',
    onClick: () => router.push('/attendance'),
  };

  const rail: Array<{
    label: string;
    onClick: () => void;
    value?: number;
    customValue?: { approved: number; pending: number };
  }> = [
    {
      label: isInstitution ? 'Enrolled students' : 'People in the directory',
      value: isInstitution ? students.length : employees.length,
      onClick: () => router.push(isInstitution ? '/student-directory' : '/hr'),
    },
    {
      label: isInstitution ? 'Staff and faculty' : 'Leave requests',
      onClick: () => router.push(isInstitution ? '/hr' : '/leaves'),
      customValue: isInstitution ? undefined : { approved: approvedLeaves, pending: pendingLeaves },
      value: isInstitution ? employees.length : undefined,
    },
    {
      label: isInstitution ? 'Academic batches' : 'Active projects',
      value: isInstitution ? academicBatchesCount : activeProjects,
      onClick: () => router.push(isInstitution ? '/setup-students' : '/projects'),
    },
  ];

  return (
    <section aria-label="Organization metrics" className="dash-figures">
      <button type="button" onClick={lead.onClick} className="dash-figure-lead">
        <span className="dash-kpi-label">{lead.label}</span>
        <span className="flex items-baseline gap-1">
          <span className="dash-kpi">{lead.value}</span>
          <span className="text-[13px] font-semibold text-[var(--text-muted)]">{lead.suffix}</span>
        </span>
      </button>

      <div className="dash-figure-rail">
        {rail.map((card) => (
          <button key={card.label} type="button" onClick={card.onClick} className="dash-figure-item">
            <span className="dash-kpi-label">{card.label}</span>
            {card.customValue ? (
              <span className="dash-kpi-split">
                <b>{card.customValue.pending}</b>
                pending
                <span aria-hidden>·</span>
                <b>{card.customValue.approved}</b>
                approved
              </span>
            ) : (
              <span className="dash-kpi">{card.value}</span>
            )}
          </button>
        ))}
      </div>
    </section>
  );
};
