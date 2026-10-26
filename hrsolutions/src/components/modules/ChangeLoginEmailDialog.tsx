'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff } from 'lucide-react';
import { EmailCodeFields } from '@/components/auth/EmailCodeFields';
import { api, ApiClientError } from '@/services/apiClient';
import { AuthService } from '@/services/authService';
import '@/components/modules/setup/workspace-setup.css';

const EMPTY_CODE = ['', '', '', '', '', ''];

type Step = 'address' | 'code' | 'sent' | 'updated';

export function ChangeLoginEmailDialog({
  employeeId,
  currentEmail,
  mode,
  movesOrganizationEmail,
  onClose,
  onEmailChanged,
}: {
  employeeId: string;
  currentEmail: string;
  mode: 'self' | 'admin';
  movesOrganizationEmail: boolean;
  onClose: () => void;
  onEmailChanged?: (email: string) => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const firstField = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('address');
  const [outcome, setOutcome] = useState<'code' | 'invite'>('code');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [digits, setDigits] = useState(EMPTY_CODE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const addressOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim());
  const canSend = addressOk && (mode === 'admin' || password.length > 0) && !busy;
  const code = digits.join('');

  useEffect(() => {
    firstField.current?.focus();
  }, [step]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const sendCode = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await api.auth.requestLoginEmailChange({
        employeeId,
        newEmail: newEmail.trim().toLowerCase(),
        currentPassword: mode === 'self' ? password : undefined,
      });
      setCooldown(60);
      if (res.data?.status === 'invite_sent') {
        onEmailChanged?.(res.data.email);
        setOutcome('invite');
        setStep('sent');
        return;
      }
      setOutcome('code');
      if (mode === 'admin') {
        setStep('sent');
        return;
      }
      setDigits(EMPTY_CODE);
      setStep('code');
    } catch (err: unknown) {
      const apiErr = err as ApiClientError;
      setError(apiErr?.message || 'Could not send the verification code.');
      if (apiErr?.code === 'RESEND_COOLDOWN') {
        const wait = Number((apiErr.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds || 60);
        setCooldown(wait);
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length < 6) {
      setError('Enter the 6-digit verification code');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api.auth.confirmLoginEmailChange({
        email: newEmail.trim().toLowerCase(),
        code,
        password,
      });
      setStep('updated');
    } catch (err: unknown) {
      const apiErr = err as ApiClientError;
      setError(apiErr?.message || 'That code could not be verified.');
    } finally {
      setBusy(false);
    }
  };

  const signIn = () => {
    AuthService.logout();
    router.push('/login');
  };

  const title =
    step === 'code' ? 'Verify your new email' : step === 'updated' ? 'Login email updated' : step === 'sent' && outcome === 'invite' ? 'Invite sent' : step === 'sent' ? 'Verification code sent' : 'Change login email';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: 'rgba(23, 34, 52, 0.45)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[420px] rounded-[12px] border border-[#dde4e9] bg-white p-5"
        style={{ boxShadow: '0 5px 15px rgba(26, 46, 62, 0.06)' }}
      >
        <h2 id={titleId} className="text-[15px] font-bold tracking-[-0.02em] text-[#172234]">
          {title}
        </h2>

        {step === 'address' && (
          <form
            className="mt-4 space-y-3.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (canSend) void sendCode();
            }}
          >
            <label className="setup-field">
              Current email
              <input ref={firstField} type="email" value={currentEmail} readOnly />
            </label>
            <label className="setup-field">
              New email
              <input
                type="email"
                autoComplete="email"
                value={newEmail}
                onChange={(event) => {
                  setNewEmail(event.target.value);
                  if (error) setError('');
                }}
                placeholder="name@company.com"
              />
            </label>
            {mode === 'self' && (
              <label className="setup-field">
                Current password
                <span className="setup-password">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) setError('');
                    }}
                  />
                  <button
                    type="button"
                    className="setup-icon-btn"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.8} /> : <Eye className="h-4 w-4" strokeWidth={1.8} />}
                  </button>
                </span>
              </label>
            )}
            {movesOrganizationEmail && (
              <p className="rounded-[9px] bg-[#e8eef2] px-3 py-2.5 text-[13px] leading-snug text-[#172234]">
                This is the organization contact email. It moves with this login.
              </p>
            )}
            {mode === 'admin' && (
              <p className="rounded-[9px] bg-[#e8eef2] px-3 py-2.5 text-[13px] leading-snug text-[#172234]">
                A code goes to the new inbox. That person verifies it and sets a password there.
              </p>
            )}
            {error && (
              <p role="alert" className="pixbe-setup__message is-error">
                {error}
              </p>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <button type="submit" className="setup-button setup-button--primary w-full" disabled={!canSend}>
                {busy ? 'Sending…' : 'Send verification code'}
              </button>
              <button type="button" className="setup-button setup-button--secondary w-full" disabled={busy} onClick={onClose}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {step === 'code' && (
          <form className="mt-4 space-y-3.5" onSubmit={confirmCode}>
            <p className="text-[13px] font-normal leading-relaxed text-[#5e6c7b]">
              We sent a 6-digit code to <span className="font-semibold text-[#172234] [overflow-wrap:anywhere]">{newEmail.trim().toLowerCase()}</span>. It expires in 10 minutes. Enter it below to confirm this login address.
            </p>
            <EmailCodeFields digits={digits} onChange={setDigits} invalid={Boolean(error)} />
            {error && (
              <p role="alert" className="pixbe-setup__message is-error">
                {error}
              </p>
            )}
            <button type="submit" className="setup-button setup-button--primary w-full" disabled={busy || code.length < 6}>
              {busy ? 'Verifying…' : 'Verify email'}
            </button>
            <div className="setup-form-actions">
              <button
                type="button"
                className="setup-link"
                onClick={() => {
                  setDigits(EMPTY_CODE);
                  setError('');
                  setStep('address');
                }}
              >
                Change email
              </button>
              <button
                type="button"
                className="setup-link"
                disabled={cooldown > 0 || busy}
                onClick={() => void sendCode()}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {step === 'sent' && (
          <div className="mt-4 space-y-3.5">
            <p className="rounded-[9px] bg-[#eaf1ee] px-3 py-2.5 text-[13px] leading-snug text-[#53886b]">
              {outcome === 'invite'
                ? `An invite was sent to ${newEmail.trim().toLowerCase()}. They set a password from that message.`
                : `A code was sent to ${newEmail.trim().toLowerCase()}. Login stays on the current address until that inbox confirms it.`}
            </p>
            <button type="button" className="setup-button setup-button--primary w-full" onClick={onClose}>
              Done
            </button>
          </div>
        )}

        {step === 'updated' && (
          <div className="mt-4 space-y-3.5">
            <p className="rounded-[9px] bg-[#eaf1ee] px-3 py-2.5 text-[13px] leading-snug text-[#53886b]">
              {`Sign in with ${newEmail.trim().toLowerCase()}.`}
            </p>
            <button type="button" className="setup-button setup-button--primary w-full" onClick={signIn}>
              Sign in
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
