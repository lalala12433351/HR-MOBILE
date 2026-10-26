'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck } from 'lucide-react';
import { AuthSplitLayout } from '@/components/auth/AuthOnboardingView';
import { EmailCodeFields } from '@/components/auth/EmailCodeFields';
import { AuthStatus, SetPasswordForm } from '@/components/auth/SetPasswordForm';
import { api, ApiClientError } from '@/services/apiClient';
import { AuthService } from '@/services/authService';
import '@/components/modules/setup/workspace-setup.css';

const EMPTY_CODE = ['', '', '', '', '', ''];

type Stage = 'lookup' | 'code' | 'password' | 'done' | 'invalid';

export function ChangeEmailView({ email }: { email: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(email ? 'lookup' : 'code');
  const [address, setAddress] = useState(email);
  const [mode, setMode] = useState<'self' | 'admin'>('self');
  const [digits, setDigits] = useState(EMPTY_CODE);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const code = digits.join('');

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    api.auth
      .loginEmailChangeStatus(email)
      .then((res) => {
        if (cancelled) return;
        setMode(res.data?.mode || 'self');
        setAddress(res.data?.email || email);
        setStage('code');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const apiErr = err as ApiClientError;
        setError(apiErr?.message || 'There is no active code for this email.');
        setStage('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  const signIn = () => {
    AuthService.logout();
    router.push('/login');
  };

  const resend = async () => {
    setError('');
    setBusy(true);
    try {
      await api.auth.resendLoginEmailChange({ email: address.trim().toLowerCase() });
      setCooldown(60);
      setDigits(EMPTY_CODE);
    } catch (err: unknown) {
      const apiErr = err as ApiClientError;
      setError(apiErr?.message || 'Could not resend the code.');
      if (apiErr?.code === 'RESEND_COOLDOWN') setCooldown(60);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (nextPassword: string) => {
    setError('');
    setBusy(true);
    try {
      await api.auth.confirmLoginEmailChange({
        email: address.trim().toLowerCase(),
        code,
        password: nextPassword,
      });
      setStage('done');
    } catch (err: unknown) {
      const apiErr = err as ApiClientError;
      const message = apiErr?.message || 'Could not update the login email.';
      if (apiErr?.code === 'CODE_INVALID' || apiErr?.code === 'TOKEN_EXPIRED' || apiErr?.code === 'TOO_MANY_ATTEMPTS') {
        setError(message);
        setStage('code');
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'invalid') {
    return (
      <AuthSplitLayout contentKey="change-email-invalid">
        <div className="pixbe-setup__heading">
          <h2>Code not valid</h2>
        </div>
        <p role="alert" className="pixbe-setup__message is-error">
          {error || 'This code has expired or was replaced. Request a new one from the profile.'}
        </p>
        <button type="button" className="setup-button setup-button--primary" onClick={() => router.push('/login')}>
          Back to sign in
        </button>
      </AuthSplitLayout>
    );
  }

  if (stage === 'done') {
    return (
      <AuthSplitLayout contentKey="change-email-done">
        <AuthStatus
          tone="success"
          icon={<CircleCheck className="h-5 w-5" />}
          title="Login email updated"
          actions={
            <button type="button" className="auth-btn-primary" onClick={signIn}>
              Sign in
            </button>
          }
        >
          <p>
            Sign in with <span className="font-semibold text-[var(--auth-ink)]">{address}</span>.
          </p>
        </AuthStatus>
      </AuthSplitLayout>
    );
  }

  if (stage === 'password' && mode === 'admin') {
    return (
      <AuthSplitLayout contentKey="change-email-password">
        <div className="pixbe-setup__heading">
          <h2>Choose a password</h2>
        </div>
        {error && (
          <p role="alert" className="pixbe-setup__message is-error">
            {error}
          </p>
        )}
        <SetPasswordForm
          email={address}
          submitLabel="Update login email"
          submittingLabel="Updating login email…"
          onSubmit={confirm}
        />
      </AuthSplitLayout>
    );
  }

  if (stage === 'password') {
    return (
      <AuthSplitLayout contentKey="change-email-current-password">
        <div className="pixbe-setup__heading">
          <h2>Confirm your password</h2>
        </div>
        <form
          className="setup-fields"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy && password) void confirm(password);
          }}
        >
          <label className="setup-field">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </label>
          {error && (
            <p role="alert" className="pixbe-setup__message is-error">
              {error}
            </p>
          )}
          <button type="submit" className="setup-button setup-button--primary" disabled={busy || !password}>
            {busy ? 'Updating login email…' : 'Update login email'}
          </button>
        </form>
      </AuthSplitLayout>
    );
  }

  return (
    <AuthSplitLayout contentKey="change-email-code">
      <div className="pixbe-setup__heading">
        <h2>Enter the code.</h2>
      </div>
      {stage === 'lookup' ? (
        <p className="text-[13px] text-[#5e6c7b]">Checking the code…</p>
      ) : (
        <form
          className="setup-fields"
          onSubmit={(event) => {
            event.preventDefault();
            if (code.length < 6) {
              setError('Enter the 6-digit verification code');
              return;
            }
            setError('');
            setStage('password');
          }}
        >
          <label className="setup-field">
            Sent to
            <input
              type="email"
              value={address}
              readOnly={Boolean(email)}
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
          <EmailCodeFields digits={digits} onChange={setDigits} invalid={Boolean(error)} />
          {error && (
            <p role="alert" className="pixbe-setup__message is-error">
              {error}
            </p>
          )}
          <button type="submit" className="setup-button setup-button--primary" disabled={busy || code.length < 6}>
            Continue
          </button>
          <div className="setup-form-actions">
            <span />
            <button type="button" className="setup-link" disabled={cooldown > 0 || busy || !address.trim()} onClick={() => void resend()}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>
      )}
    </AuthSplitLayout>
  );
}
