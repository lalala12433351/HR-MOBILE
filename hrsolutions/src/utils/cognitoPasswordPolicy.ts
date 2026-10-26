/**
 * Password rules shown on create-password fields.
 * Stricter than the Cognito pool floor: 8 characters, mixed case, a number, and a symbol.
 */

const SPECIAL_CHAR = /[!@#$%^&*(),.?":{}|<>\-_+=\[\]~`\/\\;']/;

export interface CognitoPasswordChecklist {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export interface PasswordPolicyRule {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordStrengthResult {
  checklist: CognitoPasswordChecklist;
  rules: PasswordPolicyRule[];
  metCount: number;
  totalCount: number;
  isValid: boolean;
  strengthLabel: 'Weak' | 'Fair' | 'Good' | 'Strong';
  strengthColor: string;
  strengthBg: string;
  strengthPercent: number;
  missingRequirements: string[];
}

export const COGNITO_POLICY_RULES = [
  { id: 'hasMinLength', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  {
    id: 'hasLetters',
    label: 'Upper & lowercase letters',
    test: (p: string) => /[A-Z]/.test(p) && /[a-z]/.test(p),
  },
  { id: 'hasNumber', label: 'At least one number', test: (p: string) => /[0-9]/.test(p) },
  { id: 'hasSpecialChar', label: 'At least one symbol', test: (p: string) => SPECIAL_CHAR.test(p) },
] as const;

export function evaluateCognitoPassword(password: string = ''): PasswordStrengthResult {
  const p = password || '';

  const checklist: CognitoPasswordChecklist = {
    hasMinLength: p.length >= 8,
    hasUppercase: /[A-Z]/.test(p),
    hasLowercase: /[a-z]/.test(p),
    hasNumber: /[0-9]/.test(p),
    hasSpecialChar: SPECIAL_CHAR.test(p),
  };

  const rules: PasswordPolicyRule[] = COGNITO_POLICY_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.test(p),
  }));

  const missingRequirements = rules.filter((rule) => !rule.met).map((rule) => rule.label);
  const metCount = rules.filter((rule) => rule.met).length;
  const totalCount = rules.length;
  const isValid = metCount === totalCount;
  const strengthPercent = (metCount / totalCount) * 100;

  let strengthLabel: 'Weak' | 'Fair' | 'Good' | 'Strong' = 'Weak';
  let strengthColor = '#8b3133';
  let strengthBg = 'bg-red-500';

  if (metCount >= 4) {
    strengthLabel = 'Strong';
    strengthColor = '#53886b';
    strengthBg = 'bg-emerald-500';
  } else if (metCount === 3) {
    strengthLabel = 'Good';
    strengthColor = '#53886b';
    strengthBg = 'bg-emerald-500';
  } else if (metCount === 2) {
    strengthLabel = 'Fair';
    strengthColor = '#5e6c7b';
    strengthBg = 'bg-amber-500';
  }

  return {
    checklist,
    rules,
    metCount,
    totalCount,
    isValid,
    strengthLabel,
    strengthColor,
    strengthBg,
    strengthPercent,
    missingRequirements,
  };
}
