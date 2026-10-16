'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, LinkIcon } from 'lucide-react';
import { AuthOnboardingView, AuthSplitLayout } from '@/components/auth/AuthOnboardingView';
import { AuthStatus, SetPasswordForm } from '@/components/auth/SetPasswordForm';
import { api } from '@/services/apiClient';

export const ResetPasswordView: React.FC<{ token: string }> = ({ token }) => {
  const router = useRouter();
  const [status, setStatus] = useState<'form' | 'invalid' | 'done' | 'signing_in'>(token ? 'form' : 'invalid');
  const [invalidReason, setInvalidReason] = useState('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  if (status === 'signing_in' && credentials) {
    return (
      <AuthOnboardingView
        initialView="login"
        autoLogin={credentials}
        onComplete={(target) => router.replace(target || '/dashboard')}
      />
    );
  }

  if (status === 'invalid') {
    return (
      <AuthSplitLayout contentKey="reset-invalid">
        <AuthStatus
          tone="error"
          icon={<LinkIcon className="w-5 h-5" />}
          title="Reset link not valid"
          actions={
            <>
              <button type="button" className="auth-btn-primary" onClick={() => router.push('/forgot-password')}>
                Request a new link
              </button>
              <button type="button" className="auth-btn-secondary" onClick={() => router.push('/login')}>
                Back to sign in
              </button>
            </>
          }
        >
          <p>{invalidReason || 'This password reset link has expired, was already used, or was replaced by a newer one.'}</p>
        </AuthStatus>
      </AuthSplitLayout>
    );
  }

  if (status === 'done' && credentials) {
    return (
      <AuthSplitLayout contentKey="reset-done">
        <AuthStatus
          tone="success"
          icon={<CircleCheck className="w-5 h-5" />}
          title="Password updated"
          actions={
            <>
              <button type="button" className="auth-btn-primary" onClick={() => setStatus('signing_in')}>
                Continue to your workspace
              </button>
              <button type="button" className="auth-btn-secondary" onClick={() => router.push('/login')}>
                Back to sign in
              </button>
            </>
          }
        >
          <p>
            Your password for <span className="font-semibold text-[var(--auth-ink)]">{credentials.email}</span> has
            been changed. We also emailed you a confirmation.
          </p>
        </AuthStatus>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout contentKey="reset-form">
      <div className="space-y-2">
        <h2 className="text-[1.75rem] sm:text-[1.9rem] font-extrabold tracking-[-0.035em] text-[var(--auth-ink)]">
          Choose a new password
        </h2>
        <p className="text-sm text-[var(--auth-muted)] font-medium leading-relaxed">
          Pick something strong that you haven&apos;t used before.
        </p>
      </div>
      <SetPasswordForm
        submitLabel="Update password"
        submittingLabel="Updating password..."
        onSubmit={async (password) => {
          try {
            const res = await api.auth.resetPassword({ token, password });
            setCredentials({ email: res.data?.email || '', password });
            setStatus('done');
          } catch (err: any) {
            if (err?.code === 'TOKEN_INVALID' || err?.code === 'TOKEN_EXPIRED' || err?.code === 'TOKEN_USED') {
              setInvalidReason(err.message);
              setStatus('invalid');
              return;
            }
            throw err;
          }
        }}
      />
    </AuthSplitLayout>
  );
};
