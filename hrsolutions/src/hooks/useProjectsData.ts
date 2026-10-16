import { useState, useEffect } from 'react';
import { api } from '@/services/apiClient';
import { safeApiCall } from '@/hooks/safeApiCall';
import { mapApiEmployee, mapApiTask, mapApiTimesheet } from '@/services/backendSync';
import { Employee, Project, Task, AttendanceRecord, TimesheetEntry, AuditLogItem, DriveItem } from '@/types';
import { aggregatePunchesToDaily, mapStudentAttendanceToRecords } from '@/utils/attendancePunches';

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
        const [empRes, projRes, taskRes, timeRes, auditRes, punchRes, studentAttRes, docsRes] = await Promise.all([
          safeApiCall(api.identity.getEmployees(), [] as any[]),
          safeApiCall(api.projects.getProjects(), [] as any[]),
          safeApiCall(api.projects.getTasks(), [] as any[]),
          safeApiCall(api.projects.getTimesheets(), [] as any[]),
          safeApiCall(api.auditComms.getAuditLogs(), [] as any[]),
          safeApiCall(api.attendance.getPunches(), [] as any[]),
          safeApiCall(api.institute.getStudentAttendance(), [] as any[]),
          safeApiCall(api.storage.listDocuments(), [] as any[]),
        ]);

        if (!isMounted) return;

        const newData = { ...businessData };

        if (empRes.success && Array.isArray(empRes.data)) {
          newData.employees = empRes.data.map(mapApiEmployee);
        }

        if (punchRes.success && Array.isArray(punchRes.data)) {
          const employeeLookup = Object.fromEntries(
            newData.employees.map((e) => [e.id, { name: e.name, avatar: e.avatar }])
          );
          newData.attendance = aggregatePunchesToDaily(punchRes.data, { employeeLookup });
        }

        if (studentAttRes?.success && Array.isArray(studentAttRes.data)) {
          const byKey = new Map(newData.attendance.map((a) => [`${a.employeeId}|${a.date}`, a]));
          for (const rec of mapStudentAttendanceToRecords(studentAttRes.data)) {
            byKey.set(`${rec.employeeId}|${rec.date}`, rec);
          }
          newData.attendance = Array.from(byKey.values());
        }

        if (projRes.success && Array.isArray(projRes.data)) {
          newData.projects = projRes.data.map(
            (p: any) =>
              ({
                id: p.id,
                name: p.name,
                code: p.code || '',
                clientName: p.client_name || p.clientName || '',
                clientId: p.client_id || p.clientId || undefined,
                description: p.description || '',
                managerId: p.manager_id || p.managerId || '',
                managerName: p.manager_name || p.managerName || '',
                teamMembers: [],
                startDate: p.start_date || p.startDate || '',
                endDate: p.end_date || p.endDate || '',
                budget: p.budget || 0,
                currency: p.currency || 'INR',
                billingMode: String(p.billing_mode || p.billingMode || 'deliverable').toLowerCase() === 'hourly' ? 'hourly' : 'deliverable',
                hourlyRate: p.hourly_rate != null ? Number(p.hourly_rate) : p.hourlyRate != null ? Number(p.hourlyRate) : undefined,
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

        if (docsRes.success && Array.isArray(docsRes.data)) {
          const folderFromType = (value: string): DriveItem['folderCategory'] => {
            const key = String(value || '').toLowerCase();
            if (key.includes('personal')) return 'Personal';
            if (key.includes('team')) return 'Team';
            if (key.includes('customer')) return 'Customer';
            if (key.includes('company')) return 'Company';
            return 'Projects';
          };
          const typeFromName = (name: string): DriveItem['type'] => {
            const ext = name.split('.').pop()?.toLowerCase() || '';
            if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
            if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
            if (['zip', 'rar', '7z'].includes(ext)) return 'zip';
            if (['doc', 'docx', 'txt'].includes(ext)) return 'doc';
            return 'pdf';
          };
          const formatSize = (bytes: number) => {
            if (!bytes) return undefined;
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
          };
          newData.driveItems = docsRes.data.map(
            (d: any) =>
              ({
                id: String(d.id),
                name: d.file_name || d.fileName || 'Untitled',
                type: typeFromName(d.file_name || d.fileName || ''),
                size: formatSize(Number(d.file_size_bytes ?? d.fileSizeBytes ?? 0)),
                uploadedAt: d.uploaded_at || d.uploadedAt,
                modifiedDate: d.uploaded_at || d.uploadedAt,
                owner: String(d.owner_name || d.ownerName || '').trim() || 'Team',
                folderCategory: folderFromType(d.document_type || d.documentType || 'Projects'),
                s3Key: d.s3_key || d.s3Key,
                downloadUrl: d.s3_key || d.s3Key,
              }) as DriveItem
          );
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
