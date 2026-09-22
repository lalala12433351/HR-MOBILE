import { useState, useEffect } from 'react';
import { api } from '@/services/apiClient';
import { mapApiEmployee, mapApiTask } from '@/services/backendSync';
import { safeApiCall } from '@/hooks/safeApiCall';
import { Employee, Project, Task, AttendanceRecord, LeaveRequest, Student, TimesheetEntry, PayrollRecord, AuditLogItem } from '@/types';
import { mapLeaveRow } from '@/utils/mapLeaveRow';
import { applyLeaveBalancesToEmployees } from '@/utils/applyLeaveBalances';

export function useHRMSData() {
  const [businessData, setBusinessData] = useState({
    employees: [] as Employee[],
    students: [] as Student[],
    attendance: [] as AttendanceRecord[],
    leaves: [] as LeaveRequest[],
    projects: [] as Project[],
    tasks: [] as Task[],
    timesheets: [] as TimesheetEntry[],
    payrolls: [] as PayrollRecord[],
    auditLogs: [] as AuditLogItem[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [empRes, stuRes, leaveRes, projRes, taskRes, timeRes, auditRes, balRes] = await Promise.all([
          safeApiCall(api.identity.getEmployees(), [] as any[]),
          safeApiCall(api.institute.getStudents(), [] as any[]),
          safeApiCall(api.attendance.getLeaves(), [] as any[]),
          safeApiCall(api.projects.getProjects(), [] as any[]),
          safeApiCall(api.projects.getTasks(), [] as any[]),
          safeApiCall(api.projects.getTimesheets(), [] as any[]),
          safeApiCall(api.auditComms.getAuditLogs(), [] as any[]),
          safeApiCall(api.attendance.getLeaveBalances(), [] as any[]),
        ]);

        if (!isMounted) return;

        let employees =
          empRes.success && Array.isArray(empRes.data) ? empRes.data.map(mapApiEmployee) : [];
        if (balRes.success && balRes.data) {
          employees = applyLeaveBalancesToEmployees(employees, balRes.data);
        }

        setBusinessData({
          employees,
          students: stuRes.success && Array.isArray(stuRes.data) ? (stuRes.data as Student[]) : [],
          attendance: [],
          leaves:
            leaveRes.success && Array.isArray(leaveRes.data)
              ? leaveRes.data.map(mapLeaveRow)
              : [],
          projects:
            projRes.success && Array.isArray(projRes.data)
              ? projRes.data.map(
                  (p: any) =>
                    ({
                      id: p.id,
                      name: p.name,
                      status: p.status || 'In Progress',
                      budget: p.budget || 0,
                    }) as Project
                )
              : [],
          tasks:
            taskRes.success && Array.isArray(taskRes.data)
              ? taskRes.data.map(mapApiTask)
              : [],
          timesheets:
            timeRes.success && Array.isArray(timeRes.data)
              ? timeRes.data.map(
                  (ts: any) =>
                    ({
                      id: ts.id,
                      employeeId: ts.employee_id || ts.employeeId,
                      hours: Number(ts.hours_spent ?? ts.hours) || 8,
                      date: ts.work_date || ts.date || new Date().toISOString().split('T')[0],
                    }) as TimesheetEntry
                )
              : [],
          payrolls: [],
          auditLogs:
            auditRes.success && Array.isArray(auditRes.data)
              ? auditRes.data.map(
                  (l: any) =>
                    ({
                      id: l.id,
                      timestamp: l.created_at || l.timestamp,
                      user: l.actor_name || l.user,
                      action: l.action,
                      details: l.details?.message || JSON.stringify(l.details || '') || '',
                    }) as AuditLogItem
                )
              : [],
        });
      } catch (err) {
        console.debug('HRMS data fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateBusinessData = (updates: Partial<typeof businessData>) => {
    setBusinessData((prev) => ({ ...prev, ...updates }));
  };

  return { businessData, updateBusinessData, loading };
}
