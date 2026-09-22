import { useState, useEffect } from 'react';
import { api } from '@/services/apiClient';
import { safeApiCall } from '@/hooks/safeApiCall';
import { mapApiTask, mapApiTimesheet } from '@/services/backendSync';
import { Employee, Project, Task, AttendanceRecord, TimesheetEntry, AuditLogItem } from '@/types';

export function useTimesheetsData() {
  const [businessData, setBusinessData] = useState({
    employees: [] as Employee[],
    projects: [] as Project[],
    tasks: [] as Task[],
    timesheets: [] as TimesheetEntry[],
    auditLogs: [] as AuditLogItem[],
    attendance: [] as AttendanceRecord[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [empRes, projRes, taskRes, timeRes, auditRes] = await Promise.all([
          safeApiCall(api.identity.getEmployees(), [] as any[]),
          safeApiCall(api.projects.getProjects(), [] as any[]),
          safeApiCall(api.projects.getTasks(), [] as any[]),
          safeApiCall(api.projects.getTimesheets(), [] as any[]),
          safeApiCall(api.auditComms.getAuditLogs(), [] as any[]),
        ]);

        if (!isMounted) return;

        const newData = { ...businessData };

        if (empRes.success && Array.isArray(empRes.data)) {
          newData.employees = empRes.data.map((e: any) => ({
            id: e.id,
            employeeId: e.employee_code || `EMP-${e.id.slice(0,4)}`,
            name: `${e.first_name || ''} ${e.last_name || ''}`.trim() || e.employee_code,
            email: e.email,
            department: e.department_name,
            designation: e.job_title,
            status: e.account_status === 'Deactivated' ? 'Deactivated' : 'Active',
            role: e.role || 'employee',
            avatar: e.avatar || '',
            phone: e.phone || '—',
          } as Employee));
        }

        if (projRes.success && Array.isArray(projRes.data)) {
          newData.projects = projRes.data.map((p: any) => ({
            id: p.id,
            name: p.name,
            status: p.status || 'In Progress',
            budget: p.budget || 0,
            description: p.description || ''
          } as Project));
        }

        if (taskRes.success && Array.isArray(taskRes.data)) {
          newData.tasks = taskRes.data.map(mapApiTask);
        }

        if (timeRes.success && Array.isArray(timeRes.data)) {
          newData.timesheets = timeRes.data.map(mapApiTimesheet);
        }

        if (auditRes.success && Array.isArray(auditRes.data)) {
          newData.auditLogs = auditRes.data.map((l: any) => ({
            id: l.id,
            timestamp: l.created_at,
            user: l.actor_name,
            action: l.action,
            details: l.details?.message || JSON.stringify(l.details) || ''
          } as AuditLogItem));
        }

        setBusinessData(newData);

      } catch (err) {
        console.debug('Timesheets data fetch error:', err);
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
    setBusinessData(prev => ({ ...prev, ...updates }));
  };

  return { businessData, updateBusinessData, loading };
}
