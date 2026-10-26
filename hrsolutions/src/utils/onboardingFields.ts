import type { CustomProfileField } from '@/types';
import { initialOnboardingFields } from '@/data/initialData';

/** System-seeded document slots are retired — only HR-added document fields remain. */
export function sanitizeOnboardingFields(fields: CustomProfileField[]): CustomProfileField[] {
  return fields.filter((field) => !(field.section === 'documents' && field.isSystemDefault));
}

/** Merge missing system defaults into stored config so new seed fields appear for existing workspaces. */
export function mergeOnboardingFieldDefaults(fields: CustomProfileField[]): CustomProfileField[] {
  const byName = new Map(fields.map((field) => [field.name, { ...field }]));

  for (const seed of initialOnboardingFields) {
    const existing = byName.get(seed.name);
    if (!existing) {
      byName.set(seed.name, { ...seed });
      continue;
    }
    // Keep HR toggles; refresh system label/description/type when seed evolves.
    if (existing.isSystemDefault) {
      byName.set(seed.name, {
        ...existing,
        label: seed.label,
        description: seed.description,
        type: seed.type,
        placeholder: seed.placeholder,
        options: seed.options ?? existing.options,
      });
    }
  }

  // Preserve stored order, then append any newly introduced system fields.
  const ordered: CustomProfileField[] = [];
  const seen = new Set<string>();
  for (const field of fields) {
    const next = byName.get(field.name);
    if (next) {
      ordered.push(next);
      seen.add(field.name);
    }
  }
  for (const seed of initialOnboardingFields) {
    if (!seen.has(seed.name)) {
      const next = byName.get(seed.name);
      if (next) ordered.push(next);
    }
  }

  return sanitizeOnboardingFields(ordered);
}

export function resolveOnboardingFields(stored?: CustomProfileField[] | null): CustomProfileField[] {
  if (stored && stored.length > 0) {
    return mergeOnboardingFieldDefaults(sanitizeOnboardingFields(stored));
  }
  return sanitizeOnboardingFields(initialOnboardingFields);
}

export function sectionHasEnabledFields(
  fields: CustomProfileField[],
  section: CustomProfileField['section']
): boolean {
  return fields.some((field) => field.enabled && field.section === section);
}

export function getOnboardingField(
  fields: CustomProfileField[],
  name: string
): CustomProfileField | undefined {
  return fields.find((field) => field.name === name);
}

export function isOnboardingFieldEnabled(fields: CustomProfileField[], name: string): boolean {
  const match = getOnboardingField(fields, name);
  return !match || match.enabled;
}

export function isOnboardingFieldRequired(fields: CustomProfileField[], name: string): boolean {
  return Boolean(getOnboardingField(fields, name)?.required);
}
