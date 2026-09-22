'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { isInstitutionMode } from '@/utils/organizationMode';

interface SetupPromptModalProps {
  forceType?: 'employee' | 'student';
}

export const SetupPromptModal: React.FC<SetupPromptModalProps> = ({ forceType }) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const [isDismissed, setIsDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const isInstitution =
    forceType === 'student'
      ? true
      : forceType === 'employee'
      ? false
      : isInstitutionMode(state.organization, state.currentPersona);

  const dismissKey = isInstitution
    ? 'pixbe_student_setup_banner_dismissed'
    : 'pixbe_setup_banner_dismissed';

  useEffect(() => {
    setMounted(true);
    try {
      if (sessionStorage.getItem(dismissKey) === 'true') {
        setIsDismissed(true);
      }
    } catch (_) {}
  }, [dismissKey]);

  // Role guard: only executives who manage the workspace
  const role = state.currentPersona?.role;
  const isExecutive =
    !role ||
    role === 'admin' ||
    (role as string) === 'super_admin' ||
    (role as string) === 'hr_manager' ||
    (role as string) === 'principal';

  // 1. Department condition: has configured departments on their own
  const customDepts = (state.customOptions?.departments || []).filter((d) => Boolean(d && d.trim()));
  const employeeDepts = (state.employees || [])
    .filter((e) => e.id !== 'emp_creator' && e.role !== 'super_admin')
    .map((e) => e.department)
    .filter((d): d is string => Boolean(d && d.trim() && d !== '—'));
  const dashboardDepts = (dashboardState.employees || [])
    .map((e: any) => e.department)
    .filter((d: any): d is string => Boolean(d && d.trim() && d !== '—'));
  const allDepts = Array.from(new Set([...customDepts, ...employeeDepts, ...dashboardDepts]));
  const hasDepartmentOnTheirOwn = allDepts.length > 0;

  // 2. Employee condition: has added employees on their own
  const customEmployees = (state.employees || []).filter(
    (e) => e.id !== 'emp_creator' && e.role !== 'super_admin'
  );
  const hasEmployeeOnTheirOwn = customEmployees.length > 0 || (state.employees || []).length > 1 || (dashboardState.employees && dashboardState.employees.length > 0);

  // 3. Student body condition: has batches and enrolled students
  const customBatches = (state.customOptions?.academicBatches || []).filter((b) => Boolean(b && b.grade));
  const customStudents = (state.students || []).filter((s) => Boolean(s && s.name && s.rollNumber));
  const hasBatches = customBatches.length > 0;
  const hasStudents = customStudents.length > 0 || (dashboardState.students && dashboardState.students.length > 0);

  let needsSetup = false;
  let messageText = '';
  let setupRoute = '/setup';

  if (isInstitution) {
    needsSetup = !hasStudents || !hasBatches;
    setupRoute = '/setup-students';
    if (!hasStudents && !hasBatches) {
      messageText = 'You have not set up your student body yet.';
    } else if (!hasBatches) {
      messageText = 'You have not set up any academic batches yet.';
    } else {
      messageText = 'You have not enrolled any students yet.';
    }
  } else {
    needsSetup = !hasDepartmentOnTheirOwn || !hasEmployeeOnTheirOwn;
    setupRoute = '/setup';
    if (!hasDepartmentOnTheirOwn && !hasEmployeeOnTheirOwn) {
      messageText = 'You have not set up any departments or employees yet.';
    } else if (!hasDepartmentOnTheirOwn) {
      messageText = 'You have not set up any departments yet.';
    } else {
      messageText = 'You have not set up any employees yet.';
    }
  }

  if (!mounted || !needsSetup || !isExecutive || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(dismissKey, 'true');
    } catch (_) {}
  };

  return (
    <div className="w-full bg-white border border-[#e2e8f0] rounded-xl px-4 py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[#0f172a]">
          {messageText}
        </span>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        <button
          type="button"
          onClick={() => router.push(setupRoute)}
          className="h-8 px-3.5 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center"
        >
          Go to Setup
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="h-8 px-2 rounded-lg text-slate-400 hover:text-slate-600 text-base leading-none font-bold transition-colors cursor-pointer flex items-center justify-center"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
};

