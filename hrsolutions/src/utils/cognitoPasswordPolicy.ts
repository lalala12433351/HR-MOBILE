/**
 * AWS Cognito Password Policy Validator & Strength Evaluation Utility
 * 
 * Standard AWS Cognito User Pool Password Requirements:
 * 1. Minimum 8 characters
 * 2. At least 1 uppercase letter (A-Z)
 * 3. At least 1 lowercase letter (a-z)
 * 4. At least 1 numeric digit (0-9)
 * 5. At least 1 special character (!@#$%^&*...)
 */

export interface CognitoPasswordChecklist {
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export interface PasswordStrengthResult {
  checklist: CognitoPasswordChecklist;
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
  { id: 'hasUppercase', label: 'At least 1 uppercase letter (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'hasLowercase', label: 'At least 1 lowercase letter (a-z)', test: (p: string) => /[a-z]/.test(p) },
  { id: 'hasNumber', label: 'At least 1 number (0-9)', test: (p: string) => /[0-9]/.test(p) },
  { id: 'hasSpecialChar', label: 'At least 1 special symbol (!@#$%^&*)', test: (p: string) => /[!@#$%^&*(),.?":{}|<>\-_+=\[\]~`\/\\;']/.test(p) },
] as const;

export function evaluateCognitoPassword(password: string = ''): PasswordStrengthResult {
  const p = password || '';

  const checklist: CognitoPasswordChecklist = {
    hasMinLength: p.length >= 8,
    hasUppercase: /[A-Z]/.test(p),
    hasLowercase: /[a-z]/.test(p),
    hasNumber: /[0-9]/.test(p),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>\-_+=\[\]~`\/\\;']/.test(p),
  };

  const missingRequirements: string[] = [];
  if (!checklist.hasMinLength) missingRequirements.push('8+ characters');
  if (!checklist.hasUppercase) missingRequirements.push('uppercase letter (A-Z)');
  if (!checklist.hasLowercase) missingRequirements.push('lowercase letter (a-z)');
  if (!checklist.hasNumber) missingRequirements.push('number (0-9)');
  if (!checklist.hasSpecialChar) missingRequirements.push('special character (!@#$%^&*)');

  const metCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = 5;
  const isValid = metCount === totalCount;
  const strengthPercent = (metCount / totalCount) * 100;

  let strengthLabel: 'Weak' | 'Fair' | 'Good' | 'Strong' = 'Weak';
  let strengthColor = '#ef4444'; // red-500
  let strengthBg = 'bg-red-500';

  if (metCount >= 5) {
    strengthLabel = 'Strong';
    strengthColor = '#10b981'; // emerald-500
    strengthBg = 'bg-emerald-500';
  } else if (metCount >= 3) {
    strengthLabel = 'Fair';
    strengthColor = '#f59e0b'; // amber-500
    strengthBg = 'bg-amber-500';
  } else if (metCount >= 1) {
    strengthLabel = 'Weak';
    strengthColor = '#ef4444';
    strengthBg = 'bg-red-500';
  }

  return {
    checklist,
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
