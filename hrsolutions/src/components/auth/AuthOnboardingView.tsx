'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { UserPersona, Role, Employee, Student, LicensePlan } from '@/types';

import { api } from '@/services/apiClient';
import { getDefaultState, AppState, saveStoredState } from '@/services/store';
import { CognitoPasswordPolicyGuide } from '@/components/auth/CognitoPasswordPolicyGuide';
import { evaluateCognitoPassword } from '@/utils/cognitoPasswordPolicy';
import { fromApiAuthRole } from '@/utils/roleMapping';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { PixbeWordmark } from '@/components/common/PixbeBrand';
import '@/components/modules/setup/workspace-setup.css';

interface AuthOnboardingViewProps {
  initialView?: 'login' | 'signup' | 'otp' | 'onboarding';
  onComplete?: (targetRoute?: string) => void;
  /** Sign in immediately with these credentials (used after accepting an invite or resetting a password). */
  autoLogin?: { email: string; password: string };
}

const ORG_SETUP_STEPS = [
  { label: 'Organisation', detail: 'Name, size, and address' },
  { label: 'Type', detail: 'Company or institute' },
  { label: 'Title', detail: 'Your role' },
  { label: 'License', detail: 'Choose a plan' },
  { label: 'Create', detail: 'Open the workspace' },
] as const;

function WorkspaceTypeIcon({ kind }: { kind: 'Office' | 'Institute' | 'Other' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" {...common}>
      {kind === 'Office' && (
        <>
          <path d="M10 38V14l14-6 14 6v24H10Z" />
          <path d="M18 38V24h12v14M17 18h3m8 0h3M17 22h3m8 0h3" />
          <circle cx="24" cy="31" r="1.5" fill="currentColor" stroke="none" />
        </>
      )}
      {kind === 'Institute' && (
        <>
          <path d="M8 20l16-8 16 8-16 8-16-8Z" />
          <path d="M14 24v8c4 3 16 3 20 0v-8M40 20v14" />
        </>
      )}
      {kind === 'Other' && (
        <>
          <rect x="8" y="12" width="32" height="24" rx="3" />
          <path d="M14 20h20M14 26h12" />
        </>
      )}
    </svg>
  );
}

export const AuthSplitLayout: React.FC<{
  children: React.ReactNode;
  maxWidth?: string;
  contentKey?: string;
}> = ({ children, contentKey }) => {
  return (
    <div className="pixbe-auth">
      <div className="pixbe-auth__bar">
        <PixbeWordmark className="pixbe-setup__brand text-[15px]" markClassName="h-5 w-5" />
      </div>
      <main className="pixbe-auth__main">
        <div className="pixbe-auth__panel space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
};

function AuthWizardLayout({
  children,
  currentStep,
}: {
  children: React.ReactNode;
  currentStep: number;
}) {
  return (
    <div className="pixbe-setup">
      <main className="pixbe-setup__main">
        <aside className="pixbe-setup__rail">
          <PixbeWordmark className="pixbe-setup__brand text-[15px]" markClassName="h-5 w-5" />
          <h1>Open your workspace.</h1>
          <ol className="pixbe-setup__steps">
            {ORG_SETUP_STEPS.map((step, index) => {
              const number = index + 1;
              const status = number < currentStep ? 'done' : number === currentStep ? 'current' : 'upcoming';
              return (
                <li key={step.label}>
                  <button
                    type="button"
                    disabled
                    className={status === 'current' ? 'is-current' : status === 'done' ? 'is-done' : ''}
                    aria-current={status === 'current' ? 'step' : undefined}
                  >
                    <span className="pixbe-setup__step-no">{status === 'done' ? '✓' : number}</span>
                    <span>
                      <strong>{step.label}</strong>
                      <small>{step.detail}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="pixbe-setup__illustration">
            <img src="/pixbe-workspace-plan.png" alt="" />
          </div>
        </aside>
        <section className="pixbe-setup__content">{children}</section>
      </main>
    </div>
  );
}

export const AuthOnboardingView: React.FC<AuthOnboardingViewProps> = ({
  initialView = 'login',
  onComplete,
  autoLogin,
}) => {
  const router = useRouter();
  const { state, updateState, selectPersona, triggerToast, syncWithBackend } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [view, setView] = useState<'login' | 'signup' | 'otp' | 'onboarding'>(initialView);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  // Login State
  const [loginRoleTab, setLoginRoleTab] = useState<'workspace' | 'student'>('workspace');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  React.useEffect(() => {
    try {
      const savedEmail = localStorage.getItem('pixbe_remembered_email');
      if (savedEmail && !loginEmail) {
        setLoginEmail(savedEmail);
      }
    } catch (_) {}
  }, []);

  // Signup State
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [passwordMismatch, setPasswordMismatch] = useState(false);
  const [signupPasswordError, setSignupPasswordError] = useState('');
  const [signupNameError, setSignupNameError] = useState('');
  const [signupEmailError, setSignupEmailError] = useState('');

  const isValidFullName = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length < 2) return false;
    if (/^\d+$/.test(trimmed)) return false;
    if (!/[a-zA-Z]/.test(trimmed)) return false;
    return /^[a-zA-Z\s\-'.]+$/.test(trimmed);
  };

  const isValidEmailAddress = (email: string): boolean => {
    const trimmed = email.trim();
    if (!trimmed) return false;
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(trimmed);
  };

  // 6-digit OTP State
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [verificationToken, setVerificationToken] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = window.setTimeout(() => setOtpCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [otpCooldown]);

  // The workspace wizard is only reachable after email verification.
  useEffect(() => {
    if (view === 'onboarding' && !verificationToken) setView('signup');
  }, [view, verificationToken]);

  // Visibility Toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Onboarding Steps (1 to 5)
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [licensePlans, setLicensePlans] = useState<LicensePlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [plansLoading, setPlansLoading] = useState(false);

  // Onboarding Form State
  const [companyName, setCompanyName] = useState('');
  const [companyDomain, setCompanyDomain] = useState('');
  const [companySize, setCompanySize] = useState<string>('1-10');
  const [industry, setIndustry] = useState<string>('Office');
  const [customIndustry, setCustomIndustry] = useState<string>('');
  const [role, setRole] = useState<string>('CEO / Executive Owner');
  const [customRole, setCustomRole] = useState<string>('');
  const [companyNameError, setCompanyNameError] = useState('');
  const [domainError, setDomainError] = useState('');
  const [onboardingError, setOnboardingError] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('India');
  const [addressError, setAddressError] = useState('');

  const validateDomain = (dom: string) => {
    const trimmed = dom.trim().toLowerCase();
    if (!trimmed) return '';
    if (!trimmed.includes('.')) {
      return 'Domain must contain a dot (e.g. company.com)';
    }
    const domainRegex = /^[a-z0-9][a-z0-9-]*\.[a-z]{2,}(\.[a-z]{2,})?$/i;
    if (!domainRegex.test(trimmed)) {
      return 'Enter a valid domain extension (e.g. .com, .edu, .org)';
    }
    return '';
  };

  useEffect(() => {
    if (view !== 'onboarding' || step < 4) return;
    let cancelled = false;
    setPlansLoading(true);
    api.auth
      .listLicensePlans()
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data) ? (res.data as LicensePlan[]) : [];
        setLicensePlans(rows);
        setSelectedPlanId((current) => current || rows[0]?.id || '');
      })
      .catch(() => {
        if (!cancelled) setOnboardingError('License plans could not be loaded. Refresh and try again.');
      })
      .finally(() => {
        if (!cancelled) setPlansLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, step]);

  const handleNextStep = () => {
    if (isSubmitting) return;
    if (step === 1) {
      let hasErr = false;
      if (companyName.trim().length < 2 || companyName.trim().length > 128 || !/\p{L}/u.test(companyName)) {
        setCompanyNameError('Enter an organization name of 2–128 characters containing a letter.');
        hasErr = true;
      } else {
        setCompanyNameError('');
      }

      if (companyDomain.trim()) {
        const domErr = validateDomain(companyDomain);
        if (domErr) {
          setDomainError(domErr);
          hasErr = true;
        } else {
          setDomainError('');
        }
      } else {
        setDomainError('');
      }

      if (streetAddress.trim().length < 5 || city.trim().length < 2 || country.trim().length < 2) {
        setAddressError('Enter street address, city, and country.');
        hasErr = true;
      } else {
        setAddressError('');
      }

      if (hasErr) return;
    }
    if (step === 2 && industry === 'Other' && customIndustry.trim().length < 2) {
      setOnboardingError('Describe your organization type before continuing.');
      return;
    }
    if (step === 3 && role === 'Other' && customRole.trim().length < 2) {
      setOnboardingError('Enter your title before continuing.');
      return;
    }
    if (step === 4 && !selectedPlanId) {
      setOnboardingError('Choose a license before creating the workspace.');
      return;
    }

    if (step < 5) {
      setOnboardingError('');
      setStep((prev) => (prev + 1) as any);
    } else {
      handleCompleteOnboarding();
    }
  };

  const handleLogin = async (e?: React.FormEvent, credentials?: { email: string; password: string }) => {
    if (e) e.preventDefault();
    setLoginError('');

    const cleanEmail = (credentials?.email ?? loginEmail).trim().toLowerCase();
    const cleanPassword = (credentials?.password ?? loginPassword).trim();

    if (!cleanEmail || !cleanPassword) {
      setLoginError('Please enter both your identifier and password.');
      return;
    }

    if (rememberMe) {
      try {
        localStorage.setItem('pixbe_remembered_email', cleanEmail);
      } catch (_) {}
    } else {
      try {
        localStorage.removeItem('pixbe_remembered_email');
      } catch (_) {}
    }

    setIsSubmitting(true);

    try {
      // 1. Authenticate staff / admin with live PostgreSQL backend
      let res: any = null;
      try {
        res = await api.auth.login({ email: cleanEmail, password: cleanPassword });
      } catch (err) {
        console.debug('Backend auth unreachable, falling back to local verification:', err);
      }

      if (res && res.success && res.data) {
        const { token, tenant, user } = res.data;
        api.setAuth(token, tenant.slug, { persist: rememberMe });

        const resolvedRole = fromApiAuthRole(user.role);
        const isSuper = resolvedRole === 'super_admin';
        const isWorkspaceAdmin = resolvedRole === 'super_admin' || resolvedRole === 'hr_manager';
        const resolvedDesignation =
          (user.designation && user.designation !== 'Staff Member' && user.designation !== 'Team Member')
            ? user.designation
            : (isSuper ? 'Founder & CEO' : (user.designation || 'Team Member'));

        const backendOnboardingStatus = String(
          (user as any).onboardingStatus || (user as any).onboarding_status || ''
        )
          .trim()
          .toUpperCase();
        const backendHasCompletedProfile = (user as any).hasCompletedProfile;
        const backendOnboardingProgress =
          typeof (user as any).onboardingProgress === 'number'
            ? (user as any).onboardingProgress
            : undefined;

        const activePersona: UserPersona = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: resolvedRole,
          designation: resolvedDesignation,
          department: (user.department as any) || (isSuper ? 'Management' : 'General Operations'),
          avatar: user.avatar || '',
        };

        const updatedOrg = {
          ...(state.organization || {}),
          name: tenant.name,
          domain: tenant.slug,
          industry: (tenant as any).industry || state.organization?.industry || 'Corporate / Technology',
        };

        const matchedEmp = (state.employees || []).find(
          (e) => e.email?.toLowerCase() === activePersona.email.toLowerCase()
        );
        const profileCompleteFromBackend =
          backendHasCompletedProfile === true ||
          (typeof backendOnboardingProgress === 'number' && backendOnboardingProgress >= 100);
        const profileCompleteFromLocal =
          matchedEmp &&
          (matchedEmp.hasCompletedProfile === true || (matchedEmp.onboardingProgress || 0) >= 100);
        // Prefer backend flags; only fall back to local when backend omitted them
        const profileIsComplete =
          backendHasCompletedProfile !== undefined || backendOnboardingProgress !== undefined
            ? profileCompleteFromBackend
            : Boolean(profileCompleteFromLocal);

        const updatedEmployees = (state.employees || []).map((emp) => {
          const isEmpMatch =
            emp.email?.toLowerCase() === activePersona.email.toLowerCase() ||
            (isSuper && (emp.role === 'super_admin' || emp.employeeId === 'EMP001'));
          if (isEmpMatch) {
            return {
              ...emp,
              // Trust backend login activation; don't force Active before profile is complete
              isActivated: profileIsComplete ? true : emp.isActivated,
              isDeactivated: false,
              accountStatus: profileIsComplete
                ? ('Active' as const)
                : emp.accountStatus === 'Activated'
                  ? ('Active' as const)
                  : emp.accountStatus,
              hasCompletedProfile: profileIsComplete,
              onboardingProgress: profileIsComplete
                ? 100
                : backendOnboardingProgress ?? emp.onboardingProgress ?? 0,
              status: emp.status === 'Onboarding' && profileIsComplete
                ? ('Active' as const)
                : (emp.status || ('Active' as const)),
              designation: resolvedDesignation,
              role: resolvedRole,
            };
          }
          return emp;
        });

        const nextFullState: AppState = {
          ...state,
          isAuthenticated: true,
          organization: updatedOrg,
          currentPersona: activePersona,
          employees: updatedEmployees,
          ...(backendOnboardingStatus
            ? ({ onboardingStatus: backendOnboardingStatus } as any)
            : {}),
        };

        selectPersona(activePersona);
        updateState((prev) => ({
          ...prev,
          isAuthenticated: true,
          organization: updatedOrg,
          currentPersona: activePersona,
          employees: updatedEmployees,
          ...(backendOnboardingStatus
            ? ({ onboardingStatus: backendOnboardingStatus } as any)
            : {}),
        }));
        saveStoredState(nextFullState);

        const workspaceSetupIncomplete =
          isWorkspaceAdmin &&
          backendOnboardingStatus &&
          backendOnboardingStatus !== 'COMPLETED';
        const needsEmployeeOnboarding =
          !isSuper && !profileIsComplete;

        // Navigate immediately — don't block the spinner on the heavy post-login sync fan-out.
        setIsSubmitting(false);
        if (onComplete) {
          if (activePersona.role === 'student') {
            onComplete('/student-attendance');
          } else if (workspaceSetupIncomplete) {
            onComplete('/setup');
          } else if (needsEmployeeOnboarding) {
            onComplete('/employee-onboarding');
          } else {
            onComplete('/dashboard');
          }
        }
        void syncWithBackend(nextFullState).catch((syncErr) => {
          console.debug('Post-login sync note:', syncErr);
        });
        return;
      } else if (res?.error?.code === 'ACCOUNT_DEACTIVATED') {
        setLoginError(res.error.message || 'Your account has been deactivated. Please contact your workspace administrator.');
        setIsSubmitting(false);
        return;
      } else if (res?.error?.code === 'TENANT_SUSPENDED') {
        setLoginError(res.error.message || 'Your organization workspace is currently suspended.');
        setIsSubmitting(false);
        return;
      }


      setLoginError(res?.error?.message || 'Incorrect email or password. Please verify your credentials.');
    } catch (apiErr: any) {
      console.error('Login error:', apiErr.message || apiErr);
      setLoginError(apiErr.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const autoLoginStarted = useRef(false);
  useEffect(() => {
    if (!autoLogin || autoLoginStarted.current) return;
    autoLoginStarted.current = true;
    setLoginEmail(autoLogin.email);
    void handleLogin(undefined, autoLogin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLogin]);

  const requestVerificationCode = async (): Promise<boolean> => {
    setOtpSending(true);
    try {
      await api.auth.sendVerificationCode({ email: signupEmail.trim().toLowerCase(), name: signupName.trim() });
      setOtpCooldown(60);
      return true;
    } catch (err: any) {
      const code = err?.code as string | undefined;
      const retryAfter = Number(err?.details?.retryAfterSeconds || 0);
      if (code === 'RESEND_COOLDOWN') {
        setOtpCooldown(retryAfter || 60);
        // A code was already sent recently; the user can still enter it.
        return true;
      }
      if (code === 'USER_ALREADY_EXISTS') {
        setSignupEmailError(err.message || 'An account with this email already exists. Please sign in instead.');
      } else {
        setSignupEmailError(err?.message || 'We could not send the verification email. Please try again.');
      }
      return false;
    } finally {
      setOtpSending(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupPasswordError('');
    setSignupNameError('');
    setSignupEmailError('');

    let hasError = false;

    if (!isValidFullName(signupName)) {
      setSignupNameError('Full name must contain valid letters (min 2 characters, no numbers only)');
      hasError = true;
    }

    if (!isValidEmailAddress(signupEmail)) {
      setSignupEmailError('Please enter a valid email address (e.g. name@domain.com)');
      hasError = true;
    }

    const strength = evaluateCognitoPassword(signupPassword);
    if (!strength.isValid) {
      const missingStr = strength.missingRequirements.join(', ');
      setSignupPasswordError(`Password must meet all security requirements. Missing: ${missingStr}.`);
      hasError = true;
    }

    if (signupPassword !== signupConfirmPassword) {
      setPasswordMismatch(true);
      hasError = true;
    } else {
      setPasswordMismatch(false);
    }

    if (hasError) return;

    const cleanSignupEmail = signupEmail.trim().toLowerCase();
    if (verificationToken && verifiedEmail === cleanSignupEmail) {
      setView('onboarding');
      setStep(1);
      return;
    }

    setIsSubmitting(true);
    const sent = await requestVerificationCode();
    setIsSubmitting(false);
    if (!sent) return;

    setVerificationToken('');
    setVerifiedEmail('');
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError('');
    setView('otp');
  };

  const handleOtpChange = (index: number, val: string) => {
    const cleanVal = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanVal;
    setOtpDigits(newDigits);

    if (cleanVal && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasteData) {
      const newDigits = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasteData[i] || '';
      }
      setOtpDigits(newDigits);
      const focusIndex = Math.min(pasteData.length, 5);
      otpInputRefs.current[focusIndex]?.focus();
    }
  };

  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fullOtp = otpDigits.join('');
    if (fullOtp.length < 6) {
      setOtpError('Enter the 6-digit verification code');
      return;
    }
    setOtpError('');
    setIsSubmitting(true);
    try {
      const cleanSignupEmail = signupEmail.trim().toLowerCase();
      const res = await api.auth.verifyEmail({ email: cleanSignupEmail, code: fullOtp });
      setVerificationToken(res.data?.verificationToken || '');
      setVerifiedEmail(cleanSignupEmail);
      setView('onboarding');
      setStep(1);
    } catch (err: any) {
      setOtpError(err?.message || 'Incorrect code. Please try again.');
      setOtpDigits(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0 || otpSending) return;
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError('');
    const sent = await requestVerificationCode();
    if (sent) {
      otpInputRefs.current[0]?.focus();
      triggerToast({
        title: 'Code sent',
        message: `A new verification code was sent to ${signupEmail}.`,
        type: 'system',
      });
    } else {
      setOtpError('We could not send a new code. Please try again shortly.');
    }
  };

  const handleCompleteOnboarding = async () => {
    const finalIndustry = industry === 'Other' ? (customIndustry.trim() || 'Custom Organization') : industry;
    const isInst =
      finalIndustry?.toLowerCase().includes('institute') ||
      finalIndustry?.toLowerCase().includes('education') ||
      finalIndustry?.toLowerCase().includes('institution') ||
      finalIndustry?.toLowerCase().includes('school') ||
      finalIndustry?.toLowerCase().includes('college');
    const finalRoleTitle = role === 'Other' ? (customRole.trim() || (isInst ? 'Principal / Dean' : 'Founder & CEO')) : role;

    // Purge previous session tokens before attempting new registration
    api.clearAuth();

    // Dynamically generate tenant slug
    const slug = (companyDomain ? companyDomain.split('.')[0] : companyName)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 32) || `tenant_${Date.now()}`;

    const resolvedAdminName = signupName || state.currentPersona?.name || 'Administrator';
    const resolvedAdminEmail = signupEmail || state.currentPersona?.email || 'admin@organization.com';
    const resolvedAdminPassword = signupPassword || state.currentPersona?.password || 'admin123';

    try {
      setOnboardingError('');
      setIsSubmitting(true);

      const formattedAddress = [streetAddress, city, stateProvince, postalCode, country]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(', ');

      const res = await api.auth.register({
        companyName: companyName || (isInst ? 'Academic Institution' : 'Workspace Organization'),
        slug,
        domain: companyDomain,
        industry: finalIndustry,
        size: companySize,
        adminName: resolvedAdminName,
        adminEmail: resolvedAdminEmail,
        adminPassword: resolvedAdminPassword,
        designation: finalRoleTitle || (isInst ? 'Principal / Dean' : 'Founder & CEO'),
        adminRoleTitle: finalRoleTitle || (isInst ? 'Principal / Dean' : 'Founder & CEO'),
        verificationToken,
        planId: selectedPlanId,
        billingCycle,
        address: streetAddress.trim(),
        city: city.trim(),
        stateProvince: stateProvince.trim(),
        postalCode: postalCode.trim(),
        country: country.trim(),
      });

      if (res.success && res.data) {
        const { token, tenant, user } = res.data;
        const activeTenantSlug = tenant?.slug || slug;

        if (token) {
          api.setAuth(token, activeTenantSlug, { persist: true });
        }

        // Always reset workspace-setup progress for a new registration so a
        // leftover TEAM_SETUP/COMPLETED cookie from a prior tenant cannot skip steps.
        if (typeof document !== 'undefined') {
          document.cookie = `BOS_ONBOARDING_STATUS=${encodeURIComponent('NOT_STARTED')}; path=/; max-age=86400; SameSite=Lax`;
        }

        const adminId = user?.id || (user as any)?.sub || `admin_${Date.now()}`;
        const superAdminPersona: UserPersona = {
          id: adminId,
          name: resolvedAdminName,
          email: resolvedAdminEmail,
          password: resolvedAdminPassword,
          role: 'super_admin',
          designation: finalRoleTitle || (isInst ? 'Principal / Dean' : 'Founder & CEO'),
          department: (isInst ? 'Administration' : 'Management') as any,
          avatar: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2394a3b8"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
        };

        const creatorEmployee: Employee = {
          id: adminId,
          employeeId: 'EMP001',
          name: superAdminPersona.name,
          fullName: superAdminPersona.name,
          email: superAdminPersona.email,
          password: resolvedAdminPassword,
          phone: '—',
          avatar: superAdminPersona.avatar,
          department: (isInst ? 'Administration' : 'Management') as any,
          team: isInst ? 'Academic Leadership' : 'Executive Leadership',
          designation: superAdminPersona.designation,
          role: 'super_admin',
          joiningDate: new Date().toISOString().substring(0, 10),
          employmentType: 'Full-time',
          location: '',
          officeName: '',
          skills: ['Leadership', 'Operations', 'Strategy', 'Administration'],
          bankDetails: {
            accountNumber: '—',
            ifscCode: '—',
            bankName: '—',
          },
          salaryDetails: {
            basic: 0,
            hra: 0,
            specialAllowance: 0,
            pfDeduction: 0,
            taxDeduction: 0,
            netPayable: 0,
          },
          emergencyContact: {
            name: '',
            relation: '',
            phone: '',
          },
          status: 'Active',
          isActivated: true,
          accountStatus: 'Active',
          hasCompletedProfile: true,
          onboardingProgress: 100,
        };

        const fresh = getDefaultState();
        const newOrg = {
          ...fresh.organization,
          id: tenant?.id || `org_${Date.now()}`,
          name: tenant?.name || companyName || (isInst ? 'Academic Institution' : 'Corporate Workspace'),
          legalName: tenant?.name || companyName || (isInst ? 'Academic Institution' : 'Corporate Workspace'),
          domain: activeTenantSlug,
          industry: finalIndustry,
          size: companySize,
          streetAddress: streetAddress.trim(),
          city: city.trim(),
          stateProvince: stateProvince.trim(),
          postalCode: postalCode.trim(),
          country: country.trim() || fresh.organization.country,
          officeLocation: {
            ...fresh.organization.officeLocation,
            address: formattedAddress,
          },
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        };

        const nextFullState: AppState = {
          ...fresh,
          isAuthenticated: true,
          organization: newOrg,
          license: (tenant as any)?.license || null,
          currentPersona: superAdminPersona,
          employees: [creatorEmployee],
          students: [],
          attendance: [],
          regularizations: [],
          announcements: [],
          leaves: [],
          projects: [],
          tasks: [],
          timesheets: [],
          payrolls: [],
          customOptions: {
            ...fresh.customOptions,
            academicBatches: [],
            offices: [],
            departments: [],
            teams: [],
            designations: [finalRoleTitle || (isInst ? 'Principal / Dean' : 'Founder & CEO')],
          },
          onboardingStatus: 'NOT_STARTED',
          auditLogs: [
            {
              id: `log_${Date.now()}`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
              user: superAdminPersona.name,
              action: isInst ? 'INSTITUTION_REGISTERED' : 'COMPANY_REGISTERED',
              entity: 'Organization',
              entityId: tenant?.id || 'org_001',
              ipAddress: '127.0.0.1',
              details: `${superAdminPersona.name} created ${tenant?.name || companyName || 'workspace'}.`,
            },
          ],
        };

        // ONLY commit authenticated state to memory & localStorage once backend confirms success
        selectPersona(superAdminPersona);
        updateState(() => nextFullState);
        saveStoredState(nextFullState);

        console.log(`[Multi-Tenant] Auto-provisioned isolated PostgreSQL schema "${tenant?.schema || ''}"`);
        void syncWithBackend(nextFullState).catch(console.debug);

        triggerToast({
          title: 'Workspace created',
          message: 'Next, configure your workplace and invite your team.',
          type: 'system',
        });

        if (onComplete) {
          onComplete(isInst ? '/setup-students' : '/setup');
        }
      } else {
        const errorMsg = (res as any)?.error?.message || 'AWS Cognito registration failed.';
        api.clearAuth();
        console.error('[Multi-Tenant] Backend registration returned error:', errorMsg);
        if ((res as any)?.error?.code === 'USER_ALREADY_EXISTS') {
          setSignupEmailError(errorMsg);
          setView('signup');
          return;
        }
        setOnboardingError(errorMsg);
        triggerToast({
          title: 'Registration Error',
          message: errorMsg,
          type: 'error',
        });
        setLoginError(errorMsg);
        return;
      }
    } catch (err: any) {
      const errorMsg = err.message || 'AWS Cognito registration failed.';
      api.clearAuth();
      if (err?.code === 'EMAIL_NOT_VERIFIED') {
        // Verification expired (30 min); send the user back to re-verify.
        setVerificationToken('');
        setVerifiedEmail('');
        setSignupEmailError('Your email verification expired. Continue to receive a new code.');
        setView('signup');
        return;
      }
      if (err?.code === 'USER_ALREADY_EXISTS') {
        setSignupEmailError(errorMsg);
        setView('signup');
        return;
      }
      setOnboardingError(errorMsg);
      setLoginError(errorMsg);
      triggerToast({
        title: 'Registration Error',
        message: errorMsg,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // VIEW 1: SIGN IN & SIGN UP
  // ==========================================
  if (view === 'login' || view === 'signup') {
    const isLogin = view === 'login';

    return (
      <AuthSplitLayout contentKey={isLogin ? 'login' : 'signup'}>
        <div className="pixbe-setup__heading">
          <h2>{isLogin ? 'Sign in.' : 'Create an account.'}</h2>
        </div>

        <div className="setup-chips pixbe-setup__mode" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            role="tab"
            aria-selected={isLogin}
            className={`setup-chip${isLogin ? ' is-on' : ''}`}
            onClick={() => {
              setSignupNameError('');
              setSignupEmailError('');
              setSignupPasswordError('');
              setLoginError('');
              setPasswordMismatch(false);
              setView('login');
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isLogin}
            className={`setup-chip${!isLogin ? ' is-on' : ''}`}
            onClick={() => {
              setSignupNameError('');
              setSignupEmailError('');
              setSignupPasswordError('');
              setLoginError('');
              setPasswordMismatch(false);
              setView('signup');
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={isLogin ? handleLogin : handleSignup} className="setup-fields">
          {!isLogin && (
            <label className="setup-field">
              Full name
              <input
                type="text"
                required
                value={signupName}
                onChange={(e) => {
                  setSignupName(e.target.value);
                  if (signupNameError) setSignupNameError('');
                }}
                placeholder="e.g. Asha Patel"
                aria-invalid={Boolean(signupNameError)}
              />
              {signupNameError && <p className="setup-location__hint">{signupNameError}</p>}
            </label>
          )}

          <label className="setup-field" htmlFor="auth-email">
            Email address
            <input
              id="auth-email"
              type={isLogin ? 'text' : 'email'}
              autoComplete={isLogin ? 'username' : 'email'}
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={isLogin ? loginEmail : signupEmail}
              onChange={(e) => {
                if (isLogin) {
                  setLoginEmail(e.target.value);
                } else {
                  setSignupEmail(e.target.value);
                  if (signupEmailError) setSignupEmailError('');
                }
              }}
              placeholder="you@company.com"
              aria-invalid={!isLogin && Boolean(signupEmailError)}
            />
            {!isLogin && signupEmailError && <p className="setup-location__hint">{signupEmailError}</p>}
          </label>

          <label className="setup-field" htmlFor="auth-password">
            Password
            <span className="setup-password">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                required
                value={isLogin ? loginPassword : signupPassword}
                onChange={(e) => {
                  if (isLogin) {
                    setLoginPassword(e.target.value);
                  } else {
                    setSignupPassword(e.target.value);
                    if (signupPasswordError) setSignupPasswordError('');
                  }
                }}
                placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                aria-invalid={!isLogin && Boolean(signupPasswordError)}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="setup-icon-btn"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                ) : (
                  <Eye className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                )}
              </button>
            </span>
            {!isLogin && (
              <>
                <CognitoPasswordPolicyGuide password={signupPassword} showAlways={signupPassword.length > 0} />
                {signupPasswordError && <p className="setup-location__hint">{signupPasswordError}</p>}
              </>
            )}
          </label>

          {!isLogin && (
            <label className="setup-field">
              Confirm password
              <span className="setup-password">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={signupConfirmPassword}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSignupConfirmPassword(val);
                    if (val === signupPassword) setPasswordMismatch(false);
                  }}
                  placeholder="Re-enter password"
                  aria-invalid={passwordMismatch}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="setup-icon-btn"
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                  )}
                </button>
              </span>
              {passwordMismatch && <p className="setup-location__hint">Passwords do not match.</p>}
            </label>
          )}

          {isLogin && (
            <div className="setup-form-actions">
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Remember me
              </label>
              <button type="button" onClick={() => router.push('/forgot-password')} className="setup-link">
                Forgot password?
              </button>
            </div>
          )}

          {isLogin && loginError && (
            <div role="alert" className="pixbe-setup__message is-error">
              <span>{loginError}</span>
            </div>
          )}

          <button type="submit" disabled={isSubmitting} className="setup-button setup-button--primary">
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" strokeWidth={2.2} aria-hidden="true" />
                <span>{isLogin ? 'Signing in…' : 'Sending code…'}</span>
              </>
            ) : (
              <span>{isLogin ? 'Sign in' : 'Continue to verification'}</span>
            )}
          </button>
        </form>

        {isLogin && (
          <p className="setup-facts-detail">
            <button type="button" className="setup-link" onClick={() => router.push('/student-login')}>
              Student portal
            </button>
          </p>
        )}
      </AuthSplitLayout>
    );
  }

  // ==========================================
  // VIEW 2: OTP EMAIL VERIFICATION
  // ==========================================
  if (view === 'otp') {
    const otpComplete = otpDigits.join('').length === 6;
    return (
      <AuthSplitLayout contentKey="otp">
        <div className="pixbe-setup__heading">
          <h2>Enter the code.</h2>
        </div>
        <label className="setup-field">
          Sent to
          <input type="email" value={signupEmail} readOnly />
        </label>

        <form onSubmit={handleVerifyOtp} className="setup-fields">
          <div className="setup-otp" role="group" aria-label="Verification code">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  otpInputRefs.current[i] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={digit}
                autoFocus={i === 0}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                onPaste={handleOtpPaste}
                onFocus={(e) => e.target.select()}
                aria-label={`Digit ${i + 1}`}
                aria-invalid={Boolean(otpError)}
              />
            ))}
          </div>

          {otpError && <p className="setup-location__hint" role="alert">{otpError}</p>}

          <button type="submit" disabled={isSubmitting || !otpComplete} className="setup-button setup-button--primary">
            {isSubmitting ? 'Verifying…' : 'Verify email'}
          </button>
        </form>

        <div className="setup-form-actions">
          <button
            type="button"
            className="setup-link"
            onClick={() => {
              setOtpDigits(['', '', '', '', '', '']);
              setOtpError('');
              setView('signup');
            }}
          >
            Change email
          </button>
          <button
            type="button"
            className="setup-link"
            onClick={handleResendOtp}
            disabled={otpCooldown > 0 || otpSending}
          >
            {otpSending ? 'Sending…' : otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}
          </button>
        </div>
      </AuthSplitLayout>
    );
  }

  // ==========================================
  // VIEW 5: ONBOARDING WIZARD
  // ==========================================
  if (view === 'onboarding') {
    const titleOptions =
      industry === 'Institute'
        ? ['Principal / Dean', 'Academic Head', 'Academic Administrator', 'Other']
        : industry === 'Office'
          ? ['CEO / Executive Owner', 'HR Manager', 'Operations Lead', 'Other']
          : ['Executive / Owner', 'Operations Lead', 'Workspace Administrator', 'Other'];

    return (
      <AuthWizardLayout currentStep={step}>
        <div
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !isSubmitting) {
              event.preventDefault();
              handleNextStep();
            }
          }}
        >
          {step === 1 && (
            <div className="setup-workplace">
              <div className="setup-workplace__heading">
                <h2>Name the organisation.</h2>
                <p>Include the registered company address.</p>
              </div>
              <div className="setup-fields" style={{ marginTop: 32, maxWidth: 520 }}>
                <label className="setup-field">
                  Organisation name
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value);
                      if (e.target.value.trim()) setCompanyNameError('');
                    }}
                    placeholder="e.g. Northwind or St. Jude Academy"
                  />
                  {companyNameError && <p className="setup-location__hint">{companyNameError}</p>}
                </label>
                <label className="setup-field">
                  Domain
                  <input
                    type="text"
                    value={companyDomain}
                    onChange={(e) => {
                      setCompanyDomain(e.target.value);
                      if (e.target.value && !validateDomain(e.target.value)) setDomainError('');
                    }}
                    placeholder="e.g. company.com"
                  />
                  {domainError && <p className="setup-location__hint">{domainError}</p>}
                </label>
                <div>
                  <p className="setup-field">Headcount</p>
                  <div className="setup-chips">
                    {['1-10', '11-50', '51-100', '101-200', '201-500', '500+'].map((size) => (
                      <button
                        key={size}
                        type="button"
                        className={`setup-chip${companySize === size ? ' is-on' : ''}`}
                        onClick={() => setCompanySize(size)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="setup-field" style={{ marginTop: 8 }}>Registered address</p>
                <label className="setup-field">
                  Street address
                  <input
                    type="text"
                    value={streetAddress}
                    onChange={(e) => {
                      setStreetAddress(e.target.value);
                      if (addressError) setAddressError('');
                    }}
                    placeholder="e.g. 12 MG Road"
                  />
                </label>
                <div className="setup-location__field-row">
                  <label className="setup-field">
                    City
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        if (addressError) setAddressError('');
                      }}
                      placeholder="e.g. Bengaluru"
                    />
                  </label>
                  <label className="setup-field">
                    State / Province
                    <input
                      type="text"
                      value={stateProvince}
                      onChange={(e) => setStateProvince(e.target.value)}
                      placeholder="e.g. Karnataka"
                    />
                  </label>
                </div>
                <div className="setup-location__field-row">
                  <label className="setup-field">
                    Postal / ZIP code
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      placeholder="e.g. 560001"
                    />
                  </label>
                  <label className="setup-field">
                    Country
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => {
                        setCountry(e.target.value);
                        if (addressError) setAddressError('');
                      }}
                      placeholder="e.g. India"
                    />
                  </label>
                </div>
                {addressError && <p className="setup-location__hint">{addressError}</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="setup-workplace">
              <div className="setup-workplace__heading">
                <h2>What kind of workspace is this?</h2>
              </div>
              <div className="setup-mode-list" role="radiogroup" aria-label="Workspace type">
                {([
                  { key: 'Office' as const, title: 'Company', detail: 'Departments, attendance, and payroll for a team.' },
                  { key: 'Institute' as const, title: 'Institute', detail: 'Students, batches, and timetables for a school.' },
                  { key: 'Other' as const, title: 'Other', detail: 'A custom organisation that is neither of those.' },
                ]).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="radio"
                    aria-checked={industry === item.key}
                    className={`setup-mode${industry === item.key ? ' setup-mode--selected' : ''}`}
                    onClick={() => {
                      setIndustry(item.key);
                      setRole(item.key === 'Institute' ? 'Principal / Dean' : item.key === 'Office' ? 'CEO / Executive Owner' : 'Executive / Owner');
                    }}
                  >
                    <span className="setup-mode__icon"><WorkspaceTypeIcon kind={item.key} /></span>
                    <span className="setup-mode__copy"><strong>{item.title}</strong><small>{item.detail}</small></span>
                    <span className="setup-mode__radio" aria-hidden="true" />
                  </button>
                ))}
              </div>
              {industry === 'Other' && (
                <label className="setup-field" style={{ marginTop: 24, maxWidth: 520 }}>
                  Organisation type
                  <input
                    type="text"
                    value={customIndustry}
                    onChange={(e) => setCustomIndustry(e.target.value)}
                    placeholder="e.g. Healthcare clinic"
                    autoFocus
                  />
                </label>
              )}
              {onboardingError && <p role="alert" className="setup-location__hint">{onboardingError}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="setup-workplace">
              <div className="setup-workplace__heading">
                <h2>Choose your title.</h2>
              </div>
              <div className="setup-chips" style={{ marginTop: 32 }} role="radiogroup" aria-label="Your title">
                {titleOptions.map((title) => (
                  <button
                    key={title}
                    type="button"
                    role="radio"
                    aria-checked={role === title}
                    className={`setup-chip${role === title ? ' is-on' : ''}`}
                    onClick={() => setRole(title)}
                  >
                    {title}
                  </button>
                ))}
              </div>
              {role === 'Other' && (
                <label className="setup-field" style={{ marginTop: 24, maxWidth: 520 }}>
                  Title
                  <input
                    type="text"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder={industry === 'Institute' ? 'e.g. Registrar' : 'e.g. Operations Director'}
                    autoFocus
                  />
                </label>
              )}
              {onboardingError && <p role="alert" className="setup-location__hint">{onboardingError}</p>}
            </div>
          )}

          {step === 4 && (
            <div className="setup-workplace">
              <div className="setup-workplace__heading">
                <h2>Choose a license.</h2>
              </div>
              <div className="setup-chips" style={{ marginTop: 24 }} role="radiogroup" aria-label="Billing cycle">
                <button type="button" role="radio" aria-checked={billingCycle === 'monthly'} className={`setup-chip${billingCycle === 'monthly' ? ' is-on' : ''}`} onClick={() => setBillingCycle('monthly')}>Monthly</button>
                <button type="button" role="radio" aria-checked={billingCycle === 'annual'} className={`setup-chip${billingCycle === 'annual' ? ' is-on' : ''}`} onClick={() => setBillingCycle('annual')}>Annual</button>
              </div>
              {plansLoading && <p className="setup-location__hint" style={{ marginTop: 16 }}>Loading plans…</p>}
              <div className="setup-mode-list" role="radiogroup" aria-label="License plans" style={{ marginTop: 20 }}>
                {licensePlans.map((plan) => {
                  const price = billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;
                  const selected = selectedPlanId === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`setup-mode${selected ? ' setup-mode--selected' : ''}`}
                      onClick={() => {
                        setSelectedPlanId(plan.id);
                        setOnboardingError('');
                      }}
                    >
                      <span className="setup-mode__copy">
                        <strong>{plan.name}</strong>
                        <small>
                          {price ? `$${price}/${billingCycle === 'annual' ? 'yr' : 'mo'}` : 'Included'} · {plan.maxSeats} seats
                          {plan.trialDays > 0 ? ` · ${plan.trialDays}-day trial` : ''}
                        </small>
                        {(plan.features || []).slice(0, 4).map((feature) => (
                          <small key={feature}>{feature}</small>
                        ))}
                      </span>
                      <span className="setup-mode__radio" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
              {onboardingError && <p role="alert" className="setup-location__hint">{onboardingError}</p>}
            </div>
          )}

          {step === 5 && (
            <div className="setup-workplace">
              <div className="setup-workplace__heading">
                <h2>Create the workspace.</h2>
              </div>
              <div className="setup-facts">
                <span><strong>{companyName || '—'}</strong> organisation</span>
                <span><strong>{industry === 'Office' ? 'Company' : industry === 'Institute' ? 'Institute' : customIndustry || 'Other'}</strong> type</span>
                <span><strong>{companySize}</strong> headcount</span>
                <span><strong>{[streetAddress, city, stateProvince, postalCode, country].map((part) => part.trim()).filter(Boolean).join(', ') || '—'}</strong> address</span>
                <span><strong>{role === 'Other' ? customRole || 'Other' : role}</strong> title</span>
                <span><strong>{licensePlans.find((p) => p.id === selectedPlanId)?.name || '—'}</strong> license</span>
              </div>
              {onboardingError && <div role="alert" className="pixbe-setup__message is-error"><span>{onboardingError}</span></div>}
              <div className="setup-next">
                <h3>What happens next</h3>
                <p>After this, you set workplaces, structure, hours, and invitations, then launch into the dashboard.</p>
              </div>
            </div>
          )}

          <div className="setup-workplace__footer">
            {step === 1 ? (
              <button type="button" className="setup-button setup-button--secondary" onClick={() => setView('login')}>Cancel</button>
            ) : (
              <button type="button" className="setup-button setup-button--secondary" onClick={() => setStep((prev) => Math.max(1, prev - 1) as typeof prev)}>Back</button>
            )}
            <button type="button" className="setup-button setup-button--primary" disabled={isSubmitting || (step === 4 && !selectedPlanId)} onClick={handleNextStep}>
              {isSubmitting ? 'Creating…' : step === 5 ? 'Create workspace' : 'Continue'}
              {!isSubmitting && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </div>
      </AuthWizardLayout>
    );
  }

  return null;
};
