'use client';

import React from 'react';
import { evaluateCognitoPassword, COGNITO_POLICY_RULES } from '@/utils/cognitoPasswordPolicy';

interface CognitoPasswordPolicyGuideProps {
  password: string;
  showAlways?: boolean;
}

export const CognitoPasswordPolicyGuide: React.FC<CognitoPasswordPolicyGuideProps> = ({
  password,
  showAlways = false,
}) => {
  const result = evaluateCognitoPassword(password);
  const hasStartedTyping = password.length > 0;

  if (!hasStartedTyping && !showAlways) {
    return null;
  }

  return (
    <div className="setup-remote-note" style={{ marginTop: 10 }} role="status">
      <strong>{result.isValid ? 'Password meets the requirements.' : `${result.metCount} of 5 requirements met.`}</strong>
      <span>
        {COGNITO_POLICY_RULES.map((rule) => (
          <span key={rule.id} style={{ display: 'block', color: rule.test(password) ? '#28523b' : '#466957' }}>
            {rule.test(password) ? 'Done — ' : 'Needed — '}
            {rule.label}
          </span>
        ))}
      </span>
    </div>
  );
};
