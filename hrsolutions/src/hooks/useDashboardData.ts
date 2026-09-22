import { useState, useEffect } from 'react';
import { api } from '@/services/apiClient';
import { mapApiEmployee, mapApiTask, mapApiTimesheet } from '@/services/backendSync';
import { safeApiCall } from '@/hooks/safeApiCall';
import { Employee, Project, Task, AttendanceRecord, LeaveRequest, Student, TimesheetEntry, AuditLogItem } from '@/types';
import { aggregatePunchesToDaily } from '@/utils/attendancePunches';
import { mapLeaveRow } from '@/utils/mapLeaveRow';
import { applyLeaveBalancesToEmployees } from '@/utils/applyLeaveBalances';

export function useDashboardData() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [empRes, stuRes, punchRes, leaveRes, projRes, taskRes, timeRes, auditRes, balRes] = await Promise.all([
          safeApiCall(api.identity.getEmployees(), [] as any[]),
          safeApiCall(api.institute.getStudents(), [] as any[]),
          safeApiCall(api.attendance.getPunches(), [] as any[]),
          safeApiCall(api.attendance.getLeaves(), [] as any[]),
          safeApiCall(api.projects.getProjects(), [] as any[]),
          safeApiCall(api.projects.getTasks(), [] as any[]),
          safeApiCall(api.projects.getTimesheets(), [] as any[]),
          safeApiCall(api.auditComms.getAuditLogs(), [] as any[]),
          safeApiCall(api.attendance.getLeaveBalances(), [] as any[]),
        ]);

        if (!isMounted) return;

        let mappedEmployees: Employee[] = [];
        if (empRes.success && Array.isArray(empRes.data)) {
          mappedEmployees = empRes.data.map(mapApiEmployee);
          if (balRes.success && balRes.data) {
            mappedEmployees = applyLeaveBalancesToEmployees(mappedEmployees, balRes.data);
          }
          setEmployees(mappedEmployees);
        }

        if (stuRes.success && Array.isArray(stuRes.data)) {
          setStudents(stuRes.data as Student[]);
        }

        if (punchRes.success && Array.isArray(punchRes.data)) {
          const employeeLookup = Object.fromEntries(
            mappedEmployees.map((e) => [e.id, { name: e.name, avatar: e.avatar }])
          );
          setAttendance(aggregatePunchesToDaily(punchRes.data, { employeeLookup }));
        }

        if (leaveRes.success && Array.isArray(leaveRes.data)) {
          setLeaves(leaveRes.data.map(mapLeaveRow));
        }

        if (projRes.success && Array.isArray(projRes.data)) {
          setProjects(
            projRes.data.map(
              (p: any) =>
                ({
                  id: p.id,
                  name: p.name,
                  status: p.status || 'In Progress',
                }) as Project
            )
          );
        }

        if (taskRes.success && Array.isArray(taskRes.data)) {
          setTasks(taskRes.data.map(mapApiTask));
        }

        if (timeRes.success && Array.isArray(timeRes.data)) {
          setTimesheets(timeRes.data.map(mapApiTimesheet));
        }

        if (auditRes.success && Array.isArray(auditRes.data)) {
          setAuditLogs(
            auditRes.data.map(
              (l: any) =>
                ({
                  id: l.id,
                  timestamp: l.created_at || l.timestamp,
                  user: l.actor_name || l.user,
                  action: l.action,
                  details: l.details?.message || JSON.stringify(l.details || '') || '',
                }) as AuditLogItem
            )
          );
        }
      } catch (err) {
        console.debug('Dashboard data fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  return { employees, students, attendance, leaves, projects, tasks, timesheets, auditLogs, loading };
}
