'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { isInstitutionMode } from '@/utils/organizationMode';
import { localDateKey } from '@/utils/dashboardPeople';

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

  const todayStr = localDateKey();
  const todayPunches = attendance.filter((a) => a.date === todayStr);
  const presentEmployeesCount = new Set(
    todayPunches
      .filter((a) => a.status === 'Present' || a.status === 'Late' || a.status === 'Work From Home')
      .map((a) => a.employeeId)
  ).size;

  const totalMembers = isInstitution ? students.length + employees.length : employees.length;
  const attendanceRate =
    totalMembers > 0
      ? Math.min(100, Math.round((presentEmployeesCount / totalMembers) * 1000) / 10)
      : 0;

  const pendingLeaves = leaves.filter((l) => l.status === 'Pending').length;
  const activeProjects = projects.filter((p) => p.status === 'In Progress' || !p.status).length;
  const academicBatchesCount =
    state.customOptions?.academicBatches?.length ||
    new Set(students.map((s) => s.grade || s.section).filter(Boolean)).size;

  const cards = [
    {
      key: 'attendance',
      tone: 'attendance',
      label: isInstitution ? 'Student attendance' : 'Attendance today',
      value: `${attendanceRate}%`,
      note: '',
      onClick: () => router.push('/attendance'),
    },
    {
      key: 'people',
      tone: 'people',
      label: isInstitution ? 'Enrolled students' : 'People',
      value: String(isInstitution ? students.length : employees.length),
      note: '',
      onClick: () => router.push(isInstitution ? '/student-directory' : '/hr'),
    },
    {
      key: 'leave',
      tone: 'leave',
      label: isInstitution ? 'Staff' : 'Leave requests',
      value: String(isInstitution ? employees.length : pendingLeaves),
      note: '',
      onClick: () => router.push(isInstitution ? '/hr' : '/leaves'),
    },
    {
      key: 'projects',
      tone: 'projects',
      label: isInstitution ? 'Academic batches' : 'Active projects',
      value: String(isInstitution ? academicBatchesCount : activeProjects),
      note: '',
      onClick: () => router.push(isInstitution ? '/setup-students' : '/projects'),
    },
  ];

  return (
    <section aria-label="Organization metrics" className="dash-metrics">
      {cards.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={card.onClick}
          className="dash-metric"
          data-tone={card.tone}
        >
          <span className="dash-kpi-label">{card.label}</span>
          <span className="dash-kpi">{card.value}</span>
          {card.note ? <span className="dash-metric-note">{card.note}</span> : null}
        </button>
      ))}
    </section>
  );
};
