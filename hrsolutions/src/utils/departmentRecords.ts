import { AppState } from '@/services/store';
import { DepartmentRecord, Employee } from '@/types';

export function departmentRecordsOf(state: AppState): DepartmentRecord[] {
  return ((state.customOptions as any)?.departmentRecords || []) as DepartmentRecord[];
}

export function findDepartmentRecord(
  records: DepartmentRecord[],
  nameOrId: string
): DepartmentRecord | undefined {
  const key = nameOrId.trim().toLowerCase();
  return records.find(
    (r) => r.id === nameOrId || String(r.name || '').trim().toLowerCase() === key
  );
}

export function leadIdsOf(record?: DepartmentRecord | null): string[] {
  if (record?.leadEmployeeIds?.length) return record.leadEmployeeIds;
  if (record?.leadEmployeeId) return [record.leadEmployeeId];
  return [];
}

export function applyDepartmentLocalUpdate(
  prev: AppState,
  patch: {
    id: string;
    previousName: string;
    name: string;
    shortCode?: string;
    description?: string;
    leadEmployeeId?: string | null;
    leadName?: string | null;
    leadEmployeeIds?: string[];
    leadNames?: string[];
  }
): AppState {
  const previousName = patch.previousName.trim();
  const nextName = patch.name.trim() || previousName;
  const renamed = previousName.toLowerCase() !== nextName.toLowerCase();
  const existing = departmentRecordsOf(prev);
  const hasRecord = existing.some((r) => r.id === patch.id);
  const nextRecord: DepartmentRecord = {
    ...(existing.find((r) => r.id === patch.id) || { name: nextName }),
    id: patch.id,
    name: nextName,
    shortCode: patch.shortCode ?? existing.find((r) => r.id === patch.id)?.shortCode,
    description: patch.description ?? existing.find((r) => r.id === patch.id)?.description,
    leadEmployeeId: patch.leadEmployeeId !== undefined ? patch.leadEmployeeId : existing.find((r) => r.id === patch.id)?.leadEmployeeId,
    leadName: patch.leadName !== undefined ? patch.leadName : existing.find((r) => r.id === patch.id)?.leadName,
    leadEmployeeIds: patch.leadEmployeeIds ?? existing.find((r) => r.id === patch.id)?.leadEmployeeIds,
    leadNames: patch.leadNames ?? existing.find((r) => r.id === patch.id)?.leadNames,
  };

  const departments = (prev.customOptions?.departments || []).map((d) =>
    renamed && d.toLowerCase() === previousName.toLowerCase() ? nextName : d
  );
  const hasName = departments.some((d) => d.toLowerCase() === nextName.toLowerCase());

  return {
    ...prev,
    employees: (prev.employees || []).map((emp: Employee) =>
      renamed && emp.department?.toLowerCase() === previousName.toLowerCase()
        ? { ...emp, department: nextName as Employee['department'] }
        : emp
    ),
    customOptions: {
      ...prev.customOptions,
      departments: hasName ? departments : [...departments, nextName],
      departmentRecords: hasRecord
        ? existing.map((r) => (r.id === patch.id ? { ...r, ...nextRecord } : r))
        : [...existing, nextRecord],
    } as AppState['customOptions'],
  };
}

export function removeDepartmentLocal(prev: AppState, id: string, name: string): AppState {
  return {
    ...prev,
    customOptions: {
      ...prev.customOptions,
      departments: (prev.customOptions?.departments || []).filter(
        (d) => d.toLowerCase() !== name.toLowerCase()
      ),
      departmentRecords: departmentRecordsOf(prev).filter((r) => r.id !== id),
    } as AppState['customOptions'],
  };
}
