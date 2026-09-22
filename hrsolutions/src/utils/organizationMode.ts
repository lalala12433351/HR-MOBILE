/**
 * Strict separation of Institute Mode vs Company Mode.
 *
 * An organization is ONLY in Institute Mode if explicitly configured as an
 * educational institution (e.g. School, Institute, College, University)
 * or if the logged in persona is a student/faculty.
 *
 * Otherwise, the workspace runs strictly in Company Mode (Office / Corporate).
 */
export function isInstitutionMode(
  organization?: { industry?: string; name?: string } | null,
  currentPersona?: { role?: string } | null
): boolean {
  if (currentPersona?.role === 'student' || currentPersona?.role === 'faculty') {
    return true;
  }

  const ind = (organization?.industry || '').trim().toLowerCase();
  if (!ind || ind === 'office' || ind === 'company' || ind === 'corporate' || ind === 'technology' || ind === 'general') {
    return false;
  }

  return ['institute', 'school', 'college', 'university', 'academy', 'education', 'institution'].some(
    (keyword) => ind.includes(keyword)
  );
}

export function getWorkspaceMode(
  organization?: { industry?: string; name?: string } | null,
  currentPersona?: { role?: string } | null
): 'institution' | 'company' {
  return isInstitutionMode(organization, currentPersona) ? 'institution' : 'company';
}
