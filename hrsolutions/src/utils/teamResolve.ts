import { api } from '@/services/apiClient';

/**
 * Resolve a team UUID for a department + team name, creating the team row if needed.
 * Optionally assigns leadEmployeeId (Manager) when creating or when the team has no lead.
 */
export async function resolveOrCreateTeamId(options: {
  departmentName?: string;
  teamName?: string;
  leadEmployeeId?: string;
}): Promise<string | undefined> {
  const departmentName = String(options.departmentName || '').trim();
  const teamName = String(options.teamName || (departmentName ? `${departmentName} Team` : '')).trim();
  if (!teamName) return undefined;

  let departmentId: string | undefined;
  try {
    const deptsRes = await api.org.getDepartments();
    if (deptsRes.success && Array.isArray(deptsRes.data)) {
      const match = departmentName
        ? deptsRes.data.find(
            (d: any) => String(d.name || '').trim().toLowerCase() === departmentName.toLowerCase()
          )
        : deptsRes.data[0];
      departmentId = match?.id;
    }
  } catch {
    // Server resolves the team inside the named department when this lookup misses.
  }

  if (departmentName && !departmentId) return undefined;

  try {
    const teamsRes = await api.org.getTeams(departmentId);
    if (teamsRes.success && Array.isArray(teamsRes.data)) {
      const existing = teamsRes.data.find((t: any) => {
        const sameName = String(t.name || '').trim().toLowerCase() === teamName.toLowerCase();
        if (!sameName) return false;
        if (!departmentName) return true;
        const teamDept = String(t.department_name || t.departmentName || '').trim().toLowerCase();
        return !teamDept || teamDept === departmentName.toLowerCase();
      });
      if (existing?.id) {
        if (options.leadEmployeeId && !existing.lead_employee_id && !existing.leadEmployeeId) {
          await api.org.updateTeam(existing.id, { leadEmployeeId: options.leadEmployeeId });
        }
        return String(existing.id);
      }
    }

    if (!departmentId) return undefined;

    const created = await api.org.createTeam({
      departmentId,
      name: teamName,
      leadEmployeeId: options.leadEmployeeId,
    });
    if (created.success && created.data?.id) {
      return String(created.data.id);
    }
  } catch (e) {
    console.warn('[teamResolve] Failed to resolve/create team', e);
  }

  return undefined;
}
