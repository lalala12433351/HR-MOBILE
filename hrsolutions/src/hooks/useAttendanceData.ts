import { useState, useEffect } from 'react';
import { api } from '@/services/apiClient';
import { safeApiCall } from '@/hooks/safeApiCall';
import { mapApiTask } from '@/services/backendSync';
import { Employee, Project, Task, AttendanceRecord, LeaveRequest, AttendanceRegularization, AuditLogItem, Student } from '@/types';
import { aggregatePunchesToDaily, mapStudentAttendanceToRecords } from '@/utils/attendancePunches';
import { mapLeaveRow } from '@/utils/mapLeaveRow';
import { applyLeaveBalancesToEmployees } from '@/utils/applyLeaveBalances';

export function useAttendanceData() {
  const [businessData, setBusinessData] = useState({
    employees: [] as Employee[],
    attendance: [] as AttendanceRecord[],
    leaves: [] as LeaveRequest[],
    regularizations: [] as AttendanceRegularization[],
    projects: [] as Project[],
    tasks: [] as Task[],
    students: [] as Student[],
    auditLogs: [] as AuditLogItem[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [empRes, punchRes, leaveRes, regRes, projRes, taskRes, auditRes, studentRes, studentAttRes, balRes] = await Promise.all([
          safeApiCall(api.identity.getEmployees(), [] as any[]),
          safeApiCall(api.attendance.getPunches(), [] as any[]),
          safeApiCall(api.attendance.getLeaves(), [] as any[]),
          safeApiCall(api.attendance.getRegularizations(), [] as any[]),
          safeApiCall(api.projects.getProjects(), [] as any[]),
          safeApiCall(api.projects.getTasks(), [] as any[]),
          safeApiCall(api.auditComms.getAuditLogs(), [] as any[]),
          safeApiCall(api.institute.getStudents(), [] as any[]),
          safeApiCall(api.institute.getStudentAttendance(), [] as any[]),
          safeApiCall(api.attendance.getLeaveBalances(), [] as any[]),
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

        if (balRes.success && balRes.data) {
          newData.employees = applyLeaveBalancesToEmployees(newData.employees, balRes.data);
        }

        if (punchRes.success && Array.isArray(punchRes.data)) {
          const employeeLookup = Object.fromEntries(
            newData.employees.map((e) => [e.id, { name: e.name, avatar: e.avatar }])
          );
          newData.attendance = aggregatePunchesToDaily(punchRes.data, { employeeLookup });
        }

        if (studentRes && studentRes.success && Array.isArray(studentRes.data)) {
          newData.students = studentRes.data.map((s: any) => ({
            id: s.id,
            studentId: s.student_code || s.id,
            name: `${s.first_name || ''} ${s.last_name || ''}`.trim(),
            grade: s.grade || '',
            section: s.section || '',
            avatar: s.avatar || ''
          } as Student));
        }

        if (studentAttRes?.success && Array.isArray(studentAttRes.data)) {
          const studentLookup = Object.fromEntries(
            newData.students.map((s) => [s.id, { name: s.name, avatar: s.avatar }])
          );
          const studentRecords = mapStudentAttendanceToRecords(studentAttRes.data, studentLookup);
          // Merge: student rows win on same id; otherwise append
          const byKey = new Map(newData.attendance.map((a) => [`${a.employeeId}|${a.date}`, a]));
          for (const rec of studentRecords) {
            byKey.set(`${rec.employeeId}|${rec.date}`, rec);
          }
          newData.attendance = Array.from(byKey.values());
        }

        if (leaveRes.success && Array.isArray(leaveRes.data)) {
          newData.leaves = leaveRes.data.map(mapLeaveRow);
        }

        if (regRes.success && Array.isArray(regRes.data)) {
          newData.regularizations = regRes.data.map((r: any) => {
            const formatTime = (t: any) => {
              if (!t) return '';
              const s = String(t);
              // TIME from PG may be "HH:MM:SS" — format to 12h for UI
              const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
              if (!m) return s;
              let h = parseInt(m[1], 10);
              const mins = m[2];
              const period = h >= 12 ? 'PM' : 'AM';
              if (h === 0) h = 12;
              else if (h > 12) h -= 12;
              return `${String(h).padStart(2, '0')}:${mins} ${period}`;
            };
            return {
              id: r.id,
              employeeId: r.employee_id,
              employeeName: r.employee_name || '',
              avatar: '',
              department: r.department_name || '',
              date: String(r.date || '').slice(0, 10),
              requestedCheckIn: formatTime(r.requested_check_in),
              requestedCheckOut: formatTime(r.requested_check_out),
              reason: r.reason || 'Forgot Punch In',
              remarks: '',
              status: r.status === 'approved' ? 'Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending',
              appliedOn: r.created_at ? String(r.created_at).slice(0, 10) : '',
              approvedBy: r.approver_name || undefined,
            } as AttendanceRegularization;
          });
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
        console.debug('Attendance data fetch error:', err);
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
