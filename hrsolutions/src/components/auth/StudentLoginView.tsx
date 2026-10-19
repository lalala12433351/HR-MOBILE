'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { UserPersona } from '@/types';
import { api } from '@/services/apiClient';
import { AuthService } from '@/services/authService';
import { saveStoredState } from '@/services/store';
import { AuthSplitLayout } from '@/components/auth/AuthOnboardingView';

export const StudentLoginView: React.FC = () => {
  const router = useRouter();
  const { state, updateState, selectPersona, syncWithBackend } = useApp();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanId = identifier.trim().toLowerCase();
    const cleanPwd = password.trim();

    if (!cleanId) {
      setError('Please enter your Student Email or Roll Number.');
      return;
    }

    if (!cleanPwd) {
      setError('Please enter your password (initial password is your assigned Roll Number).');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await api.auth.studentLogin({ identifier: cleanId, password: cleanPwd });
      if (!res?.success || !res.data) {
        setError((res as any)?.error?.message || 'Incorrect email or password.');
        return;
      }

      const { token, tenant, user } = res.data;
      api.setAuth(token, tenant.slug, {
        persist: rememberMe,
        refreshToken: token,
        email: user.email,
      });
      AuthService.setSession({
        token,
        sub: user.sub || user.id,
        email: user.email,
        role: 'student',
        tenantId: tenant.slug,
        dbSchema: tenant.schema,
        name: user.name,
        persist: rememberMe,
        refreshToken: token,
      });

      const studentPersona: UserPersona = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'student',
        designation: user.designation || 'Student',
        department: user.department || 'Academic Studies',
        avatar: user.avatar || '',
      };

      const nextState = {
        ...state,
        isAuthenticated: true,
        currentPersona: studentPersona,
        organization: {
          ...(state.organization || {}),
          name: tenant.name || state.organization?.name,
          domain: tenant.slug || state.organization?.domain,
          industry: (tenant as any).industry || state.organization?.industry || 'Institute',
        },
      };

      selectPersona(studentPersona);
      updateState((prev) => ({
        ...prev,
        isAuthenticated: true,
        currentPersona: studentPersona,
        organization: nextState.organization,
      }));
      saveStoredState(nextState);

      // Don't block navigation on the heavy sync fan-out.
      void syncWithBackend(nextState).catch(() => {});
      router.replace('/student-attendance');
    } catch (err: any) {
      setError(err?.message || 'Incorrect email or password.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout contentKey="student-login">
      <div className="pixbe-setup__heading">
        <h2>Sign in as a student.</h2>
      </div>

      <form onSubmit={handleStudentLogin} className="space-y-3.5">
        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold text-[var(--text-secondary)]">
            Email or roll number
          </label>
          <input
            type="text"
            required
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              if (error) setError('');
            }}
            placeholder="e.g. student@school.edu or 002"
            className="auth-field"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[12px] font-semibold text-[var(--text-secondary)]">
            Password
          </label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="Initial password is assigned Roll Number"
              className="auth-field pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-[var(--text-muted)] transition-colors duration-150 cursor-pointer hover:text-[var(--text-secondary)]"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border-strong)] text-[var(--auth-accent)] focus:ring-[var(--auth-accent)] cursor-pointer"
            />
            <span className="text-sm font-medium text-[var(--text-secondary)]">Remember me</span>
          </label>
          <button
            type="button"
            onClick={() =>
              setError('Initial password is your assigned Roll Number. Contact administrator for assistance.')
            }
            className="text-sm font-semibold text-[var(--auth-accent)] transition-colors duration-150 cursor-pointer hover:text-[var(--auth-accent-deep)]"
          >
            Forgot password?
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className="auth-btn-primary">
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <span>Sign in</span>
          )}
        </button>
      </form>

      <p className="text-sm text-[var(--text-muted)] font-medium">
        Staff member?{' '}
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="font-semibold text-[var(--auth-accent)] transition-colors duration-150 cursor-pointer hover:text-[var(--auth-accent-deep)]"
        >
          Sign in here
        </button>
      </p>
    </AuthSplitLayout>
  );
};
