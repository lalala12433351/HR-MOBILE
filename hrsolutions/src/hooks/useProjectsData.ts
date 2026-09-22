import { useState, useEffect } from 'react';
import { api } from '@/services/apiClient';
import { safeApiCall } from '@/hooks/safeApiCall';
import { mapApiEmployee, mapApiTask, mapApiTimesheet } from '@/services/backendSync';
import { Employee, Project, Task, AttendanceRecord, TimesheetEntry, AuditLogItem, DriveItem } from '@/types';

export function useProjectsData() {
  const [businessData, setBusinessData] = useState({
    employees: [] as Employee[],
    attendance: [] as AttendanceRecord[],
    projects: [] as Project[],
    tasks: [] as Task[],
    timesheets: [] as TimesheetEntry[],
    auditLogs: [] as AuditLogItem[],
    driveItems: [] as DriveItem[],
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
          newData.employees = empRes.data.map(mapApiEmployee);
        }

        if (projRes.success && Array.isArray(projRes.data)) {
          newData.projects = projRes.data.map(
            (p: any) =>
              ({
                id: p.id,
                name: p.name,
                code: p.code || '',
                clientName: p.client_name || p.clientName || '',
                description: p.description || '',
                managerId: p.manager_id || p.managerId || '',
                managerName: p.manager_name || p.managerName || '',
                teamMembers: [],
                startDate: p.start_date || p.startDate || '',
                endDate: p.end_date || p.endDate || '',
                budget: p.budget || 0,
                currency: p.currency || 'INR',
                status: p.status || 'In Progress',
                priority: p.priority || 'Medium',
                progress: Number(p.progress) || 0,
              }) as Project
          );
        }

        if (taskRes.success && Array.isArray(taskRes.data)) {
          newData.tasks = taskRes.data.map(mapApiTask);
        }

        if (timeRes.success && Array.isArray(timeRes.data)) {
          newData.timesheets = timeRes.data.map(mapApiTimesheet);
        }

        if (auditRes.success && Array.isArray(auditRes.data)) {
          newData.auditLogs = auditRes.data.map(
            (l: any) =>
              ({
                id: l.id,
                timestamp: l.created_at,
                user: l.actor_name,
                action: l.action,
                details: l.details?.message || JSON.stringify(l.details) || '',
              }) as AuditLogItem
          );
        }

        setBusinessData(newData);
      } catch (err) {
        console.debug('Projects data fetch error:', err);
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
