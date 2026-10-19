import { api } from '@/services/apiClient';
import { mapApiEmployee } from '@/services/backendSync';
import { AppState } from '@/services/store';

/**
 * After department/team lead changes, the API rewrites reporting_manager_id.
 * Pull those links (and display names) back into local employee state.
 */
export async function refreshEmployeeManagerLinks(
  onUpdateState: (updater: (prev: AppState) => AppState) => void
): Promise<void> {
  try {
    const res = await api.identity.getEmployees();
    if (!res.success || !Array.isArray(res.data)) return;
    const byId = new Map<string, ReturnType<typeof mapApiEmployee>>(
      (res.data as any[]).map((row) => {
        const mapped = mapApiEmployee(row);
        return [mapped.id, mapped] as const;
      })
    );
    onUpdateState((prev) => ({
      ...prev,
      employees: (prev.employees || []).map((emp) => {
        const mapped = byId.get(emp.id);
        if (!mapped) return emp;
        return {
          ...emp,
          managerId: mapped.managerId,
          managerIds: mapped.managerIds,
          managerName: mapped.managerName,
          lineManager: mapped.lineManager,
          role: mapped.role ?? emp.role,
        };
      }),
    }));
  } catch (err) {
    console.error('Manager refresh failed', err);
  }
}
