'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { CognitoPasswordPolicyGuide } from '@/components/auth/CognitoPasswordPolicyGuide';
import { evaluateCognitoPassword } from '@/utils/cognitoPasswordPolicy';

interface SetPasswordFormProps {
  email?: string;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (password: string) => Promise<void>;
}

export const SetPasswordForm: React.FC<SetPasswordFormProps> = ({ email, submitLabel, submittingLabel, onSubmit }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [mismatch, setMismatch] = useState(false);

  const strength = evaluateCognitoPassword(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!strength.isValid) {
      setError(`Your password is missing: ${strength.missingRequirements.join(', ')}.`);
      return;
    }
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5">
      {email && (
        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold text-[var(--text-secondary)]">Email address</label>
          <input type="email" value={email} readOnly autoComplete="username" className="auth-field opacity-80 cursor-not-allowed" />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="new-password" className="block text-[12px] font-semibold text-[var(--text-secondary)]">
          New password
        </label>
        <div className="relative">
          <input
            id="new-password"
            type={showPassword ? 'text' : 'password'}
            required
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            placeholder="At least 8 characters"
            data-invalid={Boolean(error)}
            className="auth-field pr-11"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--text-muted)] transition-colors duration-150 cursor-pointer hover:text-[var(--text-secondary)]"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <CognitoPasswordPolicyGuide password={password} showAlways />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm-password" className="block text-[12px] font-semibold text-[var(--text-secondary)]">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type={showPassword ? 'text' : 'password'}
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            if (e.target.value === password) setMismatch(false);
          }}
          placeholder="Re-enter your password"
          data-invalid={mismatch}
          className="auth-field"
        />
        {mismatch && <p className="text-[11px] font-medium text-red-600">Passwords do not match</p>}
      </div>

      {error && (
        <div className="p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-xs font-semibold" role="alert">
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} className="auth-btn-primary mt-1">
        {submitting ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>{submittingLabel}</span>
          </>
        ) : (
          <span>{submitLabel}</span>
        )}
      </button>
    </form>
  );
};

export const AuthStatus: React.FC<{
  tone: 'success' | 'error' | 'info';
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ tone, icon, title, children, actions }) => {
  const toneClass =
    tone === 'success'
      ? 'bg-emerald-50 border-emerald-100 text-emerald-600'
      : tone === 'error'
        ? 'bg-red-50 border-red-100 text-red-600'
        : 'bg-blue-50 border-blue-100 text-[var(--auth-accent)]';
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${toneClass}`}>{icon}</div>
        <h2 className="text-[1.75rem] sm:text-[1.9rem] font-extrabold tracking-[-0.035em] text-[var(--auth-ink)]">{title}</h2>
        <div className="text-sm text-[var(--auth-muted)] font-medium leading-relaxed">{children}</div>
      </div>
      {actions && <div className="space-y-2.5">{actions}</div>}
    </div>
  );
};
