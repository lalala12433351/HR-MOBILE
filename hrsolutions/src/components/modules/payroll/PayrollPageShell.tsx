'use client';

import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { PayrollRunModule } from '@/components/modules/payroll/PayrollRunModule';
import { PayrollBillableModule } from '@/components/modules/payroll/PayrollBillableModule';
import { TabsTablePageSkeleton } from '@/components/skeletons';
import { useHRMSData } from '@/hooks/useHRMSData';
import { useAttendanceData } from '@/hooks/useAttendanceData';
import { isExecutiveOrAdmin } from '@/utils/teamAccess';
import { AppState } from '@/services/store';
import { Employee } from '@/types';

export function PayrollPageShell({ step }: { step: 'review' | 'adjustments' | 'export' | 'billable' }) {
  const router = useRouter();
  const { state: uiState, updateState, isLoaded } = useApp();
  const { businessData: hrms, loading: hrmsLoading } = useHRMSData();
  const { businessData: attendanceData, loading: attendanceLoading } = useAttendanceData();

  useEffect(() => {
    if (!isLoaded) return;
    if (!uiState.isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (!isExecutiveOrAdmin(uiState.currentPersona)) {
      router.replace('/dashboard');
    }
  }, [isLoaded, uiState.isAuthenticated, uiState.currentPersona, router]);

  const combinedState = useMemo(() => {
    const uiEmployees: Employee[] = Array.isArray(uiState.employees) ? uiState.employees : [];
    const hrmsEmployees: Employee[] = hrms.employees?.length ? hrms.employees : uiEmployees;
    const byId = new Map(uiEmployees.map((employee) => [employee.id, employee]));
    const employees = hrmsEmployees.map((employee) => {
      const extra = byId.get(employee.id);
      if (!extra) return employee;
      return {
        ...extra,
        ...employee,
        salaryDetails: employee.salaryDetails || extra.salaryDetails,
        payrollSummary: employee.payrollSummary || extra.payrollSummary,
        payrollGroupId: employee.payrollGroupId || extra.payrollGroupId,
        salaryType: employee.salaryType || extra.salaryType,
        hourlyRate: employee.hourlyRate || extra.hourlyRate,
        bankDetails: employee.bankDetails?.accountNumber ? employee.bankDetails : extra.bankDetails,
      };
    });

    return {
      ...uiState,
      employees,
      attendance: attendanceData.attendance?.length ? attendanceData.attendance : uiState.attendance || [],
      leaves: hrms.leaves?.length ? hrms.leaves : attendanceData.leaves?.length ? attendanceData.leaves : uiState.leaves || [],
      timesheets: hrms.timesheets?.length ? hrms.timesheets : uiState.timesheets || [],
      projects: hrms.projects?.length ? hrms.projects : uiState.projects || [],
      tasks: attendanceData.tasks?.length ? attendanceData.tasks : hrms.tasks?.length ? hrms.tasks : uiState.tasks || [],
      payrolls: uiState.payrolls || hrms.payrolls || [],
    } as AppState;
  }, [uiState, hrms, attendanceData]);

  const handleUpdateState = (updater: (prev: AppState) => AppState) => {
    updateState((prev) => updater({ ...prev, ...combinedState } as AppState));
  };

  if (!isLoaded || hrmsLoading || attendanceLoading || !isExecutiveOrAdmin(uiState.currentPersona)) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <TabsTablePageSkeleton />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {step === 'billable' ? (
        <PayrollBillableModule state={combinedState} />
      ) : (
        <PayrollRunModule state={combinedState} onUpdateState={handleUpdateState} step={step} />
      )}
    </div>
  );
}
