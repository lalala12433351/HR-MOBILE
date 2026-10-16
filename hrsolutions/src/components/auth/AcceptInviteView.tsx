'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LinkIcon, ShieldCheck } from 'lucide-react';
import { AuthOnboardingView, AuthSplitLayout } from '@/components/auth/AuthOnboardingView';
import { AuthStatus, SetPasswordForm } from '@/components/auth/SetPasswordForm';
import { api } from '@/services/apiClient';

type InviteDetails = {
  email: string;
  firstName: string;
  tenantName: string;
  role: string;
  invitedBy: string;
  expiresAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Administrator',
  hr_manager: 'HR Manager',
  manager: 'Manager',
  employee: 'Employee',
};

export const AcceptInviteView: React.FC<{ token: string }> = ({ token }) => {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'done'>(token ? 'loading' : 'invalid');
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [errorCode, setErrorCode] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.auth
      .getInvite(token)
      .then((res) => {
        if (cancelled) return;
        setInvite(res.data || null);
        setStatus(res.data ? 'ready' : 'invalid');
      })
      .catch((err: any) => {
        if (cancelled) return;
        setErrorCode(err?.code || '');
        setErrorMessage(err?.message || '');
        setStatus('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === 'done' && credentials) {
    return (
      <AuthOnboardingView
        initialView="login"
        autoLogin={credentials}
        onComplete={(target) => router.replace(target || '/employee-onboarding')}
      />
    );
  }

  if (status === 'loading') {
    return (
      <AuthSplitLayout contentKey="invite-loading">
        <div className="flex items-center gap-3 text-sm font-medium text-[var(--auth-muted)]">
          <div className="w-5 h-5 border-2 border-[var(--auth-accent)] border-t-transparent rounded-full animate-spin" />
          Checking your invitation...
        </div>
      </AuthSplitLayout>
    );
  }

  if (status === 'invalid' || !invite) {
    const expired = errorCode === 'TOKEN_EXPIRED';
    const used = errorCode === 'TOKEN_USED';
    return (
      <AuthSplitLayout contentKey="invite-invalid">
        <AuthStatus
          tone="error"
          icon={expired ? <Clock className="w-5 h-5" /> : <LinkIcon className="w-5 h-5" />}
          title={expired ? 'This invite has expired' : used ? 'This invite was already used' : 'Invite link not valid'}
          actions={
            <>
              {used && (
                <button type="button" className="auth-btn-primary" onClick={() => router.push('/login')}>
                  Go to sign in
                </button>
              )}
              <button type="button" className="auth-btn-secondary" onClick={() => router.push('/forgot-password')}>
                Forgot your password?
              </button>
            </>
          }
        >
          <p>
            {expired
              ? 'Invitation links are valid for 72 hours. Ask your workspace administrator to resend your invite.'
              : used
                ? 'Your account may already be set up. Try signing in, or ask your administrator for a new invite.'
                : errorMessage || 'This link is incomplete or has been replaced by a newer invite. Check your latest email.'}
          </p>
        </AuthStatus>
      </AuthSplitLayout>
    );
  }

  const roleLabel = ROLE_LABELS[invite.role] || invite.role.replace(/_/g, ' ');
  const greeting = invite.firstName ? `Welcome, ${invite.firstName}` : `Welcome to ${invite.tenantName}`;

  return (
    <AuthSplitLayout contentKey="invite-ready">
      <div className="space-y-2">
        <h2 className="text-[1.75rem] sm:text-[1.9rem] font-extrabold tracking-[-0.035em] text-[var(--auth-ink)]">
          {greeting}
        </h2>
        <p className="text-sm text-[var(--auth-muted)] font-medium leading-relaxed">
          {invite.invitedBy ? `${invite.invitedBy} invited you` : 'You have been invited'} to join{' '}
          <span className="font-semibold text-[var(--auth-ink)]">{invite.tenantName}</span> as{' '}
          <span className="font-semibold text-[var(--auth-ink)] capitalize">{roleLabel}</span>. Create a password to
          activate your account.
        </p>
      </div>

      <SetPasswordForm
        email={invite.email}
        submitLabel="Create account"
        submittingLabel="Activating account..."
        onSubmit={async (password) => {
          await api.auth.acceptInvite({ token, password });
          setCredentials({ email: invite.email, password });
          setStatus('done');
        }}
      />

      <p className="flex items-center gap-2 text-[11px] font-medium text-[var(--text-muted)]">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        This link expires {new Date(invite.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} and works once.
      </p>
    </AuthSplitLayout>
  );
};
