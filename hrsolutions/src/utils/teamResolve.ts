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
      const match = deptsRes.data.find(
        (d: any) =>
          departmentName &&
          String(d.name || '').trim().toLowerCase() === departmentName.toLowerCase()
      );
      departmentId = match?.id || deptsRes.data[0]?.id;
    }
  } catch {
    // fall through — createTeam can invent a department if needed
  }

  try {
    const teamsRes = await api.org.getTeams(departmentId);
    if (teamsRes.success && Array.isArray(teamsRes.data)) {
      const existing = teamsRes.data.find(
        (t: any) => String(t.name || '').trim().toLowerCase() === teamName.toLowerCase()
      );
      if (existing?.id) {
        if (options.leadEmployeeId && !existing.lead_employee_id && !existing.leadEmployeeId) {
          await api.org.updateTeam(existing.id, { leadEmployeeId: options.leadEmployeeId });
        }
        return String(existing.id);
      }
    }

    const created = await api.org.createTeam({
      departmentId: departmentId || '',
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
