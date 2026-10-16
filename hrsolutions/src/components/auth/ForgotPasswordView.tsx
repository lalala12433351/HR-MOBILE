'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MailCheck } from 'lucide-react';
import { AuthSplitLayout } from '@/components/auth/AuthOnboardingView';
import { AuthStatus } from '@/components/auth/SetPasswordForm';
import { api } from '@/services/apiClient';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ForgotPasswordView: React.FC = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    try {
      const remembered = localStorage.getItem('pixbe_remembered_email');
      if (remembered) setEmail(remembered);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const send = async () => {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError('Enter a valid email address.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api.auth.forgotPassword({ email: clean });
      setSent(true);
      setCooldown(60);
    } catch (err: any) {
      if (err?.code === 'RESEND_COOLDOWN') {
        setSent(true);
        setCooldown(Number(err?.details?.retryAfterSeconds) || 60);
      } else {
        setError(err?.message || 'We could not send the reset email. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthSplitLayout contentKey="forgot-sent">
        <AuthStatus
          tone="info"
          icon={<MailCheck className="w-5 h-5" />}
          title="Check your inbox"
          actions={
            <>
              <button type="button" className="auth-btn-primary" onClick={() => router.push('/login')}>
                Back to sign in
              </button>
              <button
                type="button"
                className="auth-btn-secondary tabular-nums"
                disabled={cooldown > 0 || submitting}
                onClick={send}
              >
                {submitting ? 'Sending...' : cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
              </button>
            </>
          }
        >
          <p>
            If an account exists for <span className="font-semibold text-[var(--auth-ink)]">{email.trim()}</span>, we
            sent a link to reset your password. The link expires in 1 hour.
          </p>
          <p className="mt-2 text-[12px]">Don&apos;t see it? Check your spam folder.</p>
        </AuthStatus>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout contentKey="forgot">
      <div className="pixbe-setup__heading">
        <h2>Reset your password.</h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="space-y-3.5"
      >
        <div className="space-y-1.5">
          <label htmlFor="forgot-email" className="block text-[12px] font-semibold text-[var(--text-secondary)]">
            Email address
          </label>
          <input
            id="forgot-email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g. sarah.johnson@email.com"
            data-invalid={Boolean(error)}
            className="auth-field"
          />
          {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
        </div>

        <button type="submit" disabled={submitting} className="auth-btn-primary">
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Sending link...</span>
            </>
          ) : (
            <span>Send reset link</span>
          )}
        </button>
        <button type="button" onClick={() => router.push('/login')} className="auth-btn-secondary">
          Back to sign in
        </button>
      </form>
    </AuthSplitLayout>
  );
};
