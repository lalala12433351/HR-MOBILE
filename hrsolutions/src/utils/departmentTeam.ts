/** "Design Team" or "Design" belongs to the department named Design. Longer names win. */
export function departmentImpliedByTeamName(
  teamName: string | undefined | null,
  departmentNames: string[]
): string | null {
  const team = String(teamName || '').trim().toLowerCase();
  if (!team) return null;
  const sorted = [...departmentNames].sort((a, b) => b.trim().length - a.trim().length);
  for (const name of sorted) {
    const key = name.trim().toLowerCase();
    if (!key) continue;
    if (team === key || team === `${key} team`) return name.trim();
  }
  return null;
}

export function alignedDepartment(
  department: string | undefined | null,
  teamName: string | undefined | null,
  departmentNames: string[]
): string {
  const implied = departmentImpliedByTeamName(teamName, departmentNames);
  const current = String(department || '').trim();
  return implied || current;
}
