'use client';

import React from 'react';
import { Check, Lock } from 'lucide-react';
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
    <div className="mt-1.5 p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/80 space-y-1.5 animate-in fade-in duration-200 text-slate-800">
      {/* Strength Header & Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold leading-tight">
          <span className="flex items-center gap-1.5 text-slate-600">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-semibold text-slate-700">Password Policy</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide transition-colors ${
              result.isValid
                ? 'bg-emerald-100 text-emerald-700'
                : result.metCount >= 3
                ? 'bg-amber-100 text-amber-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            {result.isValid ? '✓ Strong Password' : `${result.strengthLabel} (${result.metCount}/5)`}
          </span>
        </div>

        {/* 5-segment Strength Meter */}
        <div className="grid grid-cols-5 gap-1.5 h-1.5 w-full">
          {[1, 2, 3, 4, 5].map((level) => {
            const isFilled = level <= result.metCount;
            let barColor = 'bg-slate-200';
            if (isFilled) {
              if (result.isValid) barColor = 'bg-emerald-500';
              else if (result.metCount >= 3) barColor = 'bg-amber-500';
              else barColor = 'bg-red-500';
            }
            return (
              <div
                key={level}
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
              />
            );
          })}
        </div>
      </div>

      {/* 5 Policy Checklist Items */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1.5 border-t border-slate-200/60">
        {COGNITO_POLICY_RULES.map((rule) => {
          const isMet = rule.test(password);
          return (
            <div
              key={rule.id}
              className={`flex items-center gap-1.5 text-[10.5px] transition-colors ${
                isMet
                  ? 'text-emerald-700 font-semibold'
                  : 'text-slate-500 font-medium'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                  isMet
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-slate-200 text-slate-400'
                }`}
              >
                {isMet ? (
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                ) : (
                  <div className="w-1 h-1 rounded-full bg-slate-400" />
                )}
              </div>
              <span className="truncate">{rule.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

