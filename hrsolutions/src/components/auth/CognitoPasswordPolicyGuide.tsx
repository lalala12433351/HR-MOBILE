'use client';

import React from 'react';
import { CircleCheck, Circle } from 'lucide-react';
import { evaluateCognitoPassword } from '@/utils/cognitoPasswordPolicy';

interface CognitoPasswordPolicyGuideProps {
  password: string;
  showAlways?: boolean;
  variant?: 'default' | 'figma';
}

function RequirementIcon({ met, outline = false }: { met: boolean; outline?: boolean }) {
  if (outline) return met ? <CircleCheck size={13} aria-hidden="true"/> : <Circle size={13} aria-hidden="true"/>;
  if (met) {
    return (
      <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
        <circle cx="7" cy="7" r="7" fill="currentColor" />
        <path
          d="M4.1 7.15 6.05 9.1 9.9 4.9"
          fill="none"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">
      <circle cx="7" cy="7" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export const CognitoPasswordPolicyGuide: React.FC<CognitoPasswordPolicyGuideProps> = ({
  password,
  showAlways = false,
  variant = 'default',
}) => {
  const result = evaluateCognitoPassword(password);
  const hasStartedTyping = password.length > 0;

  if (!hasStartedTyping && !showAlways) {
    return null;
  }

  const tone = result.strengthLabel.toLowerCase();

  return (
    <div className="pixbe-password-policy" role="status" aria-live="polite">
      <p className="pixbe-password-policy__title">Password requirements</p>
      <div className="pixbe-password-policy__strength">
        <div className={`pixbe-password-policy__meter is-${tone}`} aria-hidden="true">
          {result.rules.map((rule, index) => (
            <span key={rule.id} className={index < result.metCount ? 'is-on' : undefined} />
          ))}
        </div>
        <span className={`pixbe-password-policy__label is-${tone}`}>
          {hasStartedTyping ? result.strengthLabel : ''}
        </span>
      </div>
      <ul className="pixbe-password-policy__list">
        {result.rules.map((rule) => (
          <li key={rule.id} className={rule.met ? 'is-met' : undefined}>
            <RequirementIcon met={rule.met} outline={variant === 'figma'} />
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
