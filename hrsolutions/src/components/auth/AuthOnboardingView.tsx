'use client';

import { OnboardingAccount, OnboardingContextBar, OnboardingPageFooter, OnboardingHelp } from '@/components/modules/setup/OnboardingChrome';
import '@/components/modules/setup/onboarding-studio.css';
import '@/components/modules/setup/figma-onboarding.css';
import { WORLD_COUNTRIES } from '@/data/nations';
import React, { useState, useRef, useEffect } from 'react';
import { useMobileViewport } from '@/hooks/useMobileViewport';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { UserPersona, Role, Employee, Student, LicensePlan } from '@/types';

import { api, ApiClientError } from '@/services/apiClient';
import { AuthService } from '@/services/authService';
import { getDefaultState, AppState, saveStoredState } from '@/services/store';
import { CognitoPasswordPolicyGuide } from '@/components/auth/CognitoPasswordPolicyGuide';
import { evaluateCognitoPassword } from '@/utils/cognitoPasswordPolicy';
import { fromApiAuthRole, toAuthSessionRole } from '@/utils/roleMapping';
import { Eye, EyeOff, Loader2, Building2, GraduationCap, Mail, Check, BadgeCheck, ArrowLeft } from 'lucide-react';
import { PixbePixelMark, PixbeWordmark, PixbeDesignWordmark } from '@/components/common/PixbeBrand';
import '@/components/modules/setup/workspace-setup.css';
import styles from './auth-mobile.module.css';

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
  if (kind === 'Other') return null;
  const Icon = kind === 'Office' ? Building2 : GraduationCap;
  return <Icon size={20} strokeWidth={1.6} aria-hidden="true"/>;
}

export const AuthSplitLayout: React.FC<{ children: React.ReactNode; maxWidth?: string; contentKey?: string }> = ({ children, contentKey }) => {
  const router = useRouter();
  const compactHeader = useMobileViewport();
  const showBack = contentKey !== 'login' && contentKey !== 'register';
  return (
  <div className={`figma-auth ${styles.shell}`} data-screen={contentKey}>
    <header className="m2-auth-header">
      {showBack && <button type="button" className={styles.back} aria-label="Back to sign in" onClick={() => router.push('/login')}><ArrowLeft size={20} strokeWidth={1.8} aria-hidden="true" /></button>}
      {compactHeader ? <span className="m2-auth-wordmark">pixbe</span> : <PixbeDesignWordmark className={styles.brand} />}
    </header>
    <PixbeDesignWordmark/>
    <main className="fa-panel">{children}</main>
    <footer className="fa-footer"><span>&copy; {new Date().getFullYear()} Pixbe</span><span><span>Privacy</span><OnboardingHelp label="Get help"/></span></footer>
  </div>
  );
};

function AuthWizardLayout({ children, currentStep, onStepChange, name, email }: { children: React.ReactNode; currentStep: number; onStepChange: (step: number) => void; name: string; email: string }) {
  return <div className="figma-setup organization-onboarding" data-step={currentStep}>
    <main className="fs-shell">
      <aside className="fs-rail"><div><PixbeDesignWordmark/><div className="fs-journey"><h1>Open your workspace</h1><p>A few details to make Pixbe yours.</p><ol>{ORG_SETUP_STEPS.map((item,index) => { const number = index+1; const status = number < currentStep ? 'done' : number === currentStep ? 'current' : 'upcoming'; return <li key={item.label}><button type="button" className={`fs-progress is-${status}`} disabled={number >= currentStep} onClick={() => onStepChange(number)} aria-current={status === 'current' ? 'step' : undefined}><span className="fs-step-number">{status === 'done' ? <Check size={14}/> : number}</span><span><strong>{item.label}</strong><small>{status === 'done' ? 'Complete' : status === 'current' ? `Step ${number} of 5, Current` : 'Upcoming'}</small></span></button></li>; })}</ol></div></div><OnboardingAccount name={name} email={email}/></aside>
      <section className="fs-content"><OnboardingContextBar/><div className="fs-form-area">{children}</div><footer className="fs-page-footer"><span>Your progress is saved as you go.</span><span>{String(currentStep).padStart(2,'0')} / 05</span></footer></section>
    </main>
  </div>;
}

export const AuthOnboardingView: React.FC<AuthOnboardingViewProps> = ({
  initialView = 'login',
  onComplete,
  autoLogin,
}) => {
  const router = useRouter();
  const mobile = useMobileViewport();
  const { state, updateState, selectPersona, triggerToast, syncWithBackend } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [view, setView] = useState<'login' | 'signup' | 'otp' | 'onboarding'>(initialView);

  useEffect(() => {
    setView(mobile ? 'login' : initialView);
  }, [initialView, mobile]);

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
    try {
      if (typeof window !== 'undefined') {
        const reason = new URLSearchParams(window.location.search).get('reason');
        if (reason === 'session') {
          setLoginError('Your previous session could not be restored. Please sign in again.');
        }
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
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual' | 'trial'>('trial');
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

  const restoredSetupDraftFor = useRef('');
  useEffect(() => {
    if (view !== 'onboarding' || !verificationToken || !verifiedEmail) return;
    const key = `pixbe_verified_org_setup:${verifiedEmail}`;
    if (restoredSetupDraftFor.current !== verifiedEmail) {
      restoredSetupDraftFor.current = verifiedEmail;
      try {
        const draft = JSON.parse(sessionStorage.getItem(key) || 'null');
        if (draft && typeof draft === 'object') {
          if (typeof draft.companyName === 'string') setCompanyName(draft.companyName);
          if (typeof draft.companyDomain === 'string') setCompanyDomain(draft.companyDomain);
          if (typeof draft.companySize === 'string') setCompanySize(draft.companySize);
          if (typeof draft.streetAddress === 'string') setStreetAddress(draft.streetAddress);
          if (typeof draft.city === 'string') setCity(draft.city);
          if (typeof draft.stateProvince === 'string') setStateProvince(draft.stateProvince);
          if (typeof draft.postalCode === 'string') setPostalCode(draft.postalCode);
          if (typeof draft.country === 'string') setCountry(draft.country);
          if (typeof draft.industry === 'string') setIndustry(draft.industry);
          if (typeof draft.customIndustry === 'string') setCustomIndustry(draft.customIndustry);
          if (typeof draft.role === 'string') setRole(draft.role);
          if (typeof draft.customRole === 'string') setCustomRole(draft.customRole);
          if (['trial','monthly','annual'].includes(draft.billingCycle)) setBillingCycle(draft.billingCycle);
          if (typeof draft.selectedPlanId === 'string') setSelectedPlanId(draft.selectedPlanId);
          if (Number.isInteger(draft.step) && draft.step >= 1 && draft.step <= 5) setStep(draft.step);
          return;
        }
      } catch { /* Setup still works when session storage is unavailable. */ }
    }
    try { sessionStorage.setItem(key, JSON.stringify({ companyName, companyDomain, companySize, streetAddress, city, stateProvince, postalCode, country, industry, customIndustry, role, customRole, billingCycle, selectedPlanId, step })); } catch { /* Keep the in-memory draft. */ }
  }, [view, verificationToken, verifiedEmail, companyName, companyDomain, companySize, streetAddress, city, stateProvince, postalCode, country, industry, customIndustry, role, customRole, billingCycle, selectedPlanId, step]);

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

      if (streetAddress.trim().length < 5 || city.trim().length < 2 || !postalCode.trim() || country.trim().length < 2) {
        setAddressError('Enter street address, city, postcode, and country.');
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
      const res = await api.auth.login({ email: cleanEmail, password: cleanPassword });

      if (!res?.success || !res.data) {
        setLoginError('Authentication failed. Please try again.');
        return;
      }

      const { token, tenant, user } = res.data;
      api.setAuth(token, tenant.slug, {
        persist: rememberMe,
        refreshToken: (res.data as any).refreshToken,
        email: user.email,
      });
      AuthService.setSession({
        token,
        sub: (user as any).sub || user.id,
        email: user.email,
        role: toAuthSessionRole(user.role),
        tenantId: tenant.slug,
        dbSchema: (tenant as any).schema,
        name: user.name,
        persist: rememberMe,
        refreshToken: (res.data as any).refreshToken,
      });

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
    } catch (apiErr: unknown) {
      console.error('Login error:', apiErr);
      if (apiErr instanceof ApiClientError) {
        if (apiErr.code === 'ACCOUNT_DEACTIVATED') {
          setLoginError(
            apiErr.message ||
              'Your account has been deactivated. Please contact your workspace administrator.'
          );
        } else if (apiErr.code === 'TENANT_SUSPENDED') {
          setLoginError(
            apiErr.message || 'Your organization workspace is currently suspended.'
          );
        } else if (apiErr.code === 'TENANT_NOT_FOUND') {
          setLoginError(
            apiErr.message ||
              'This account is not provisioned for a workspace. Ask your administrator to invite you.'
          );
        } else if (
          apiErr.code === 'FETCH_ERROR' ||
          apiErr.code === 'NON_JSON_RESPONSE' ||
          apiErr.code.startsWith('HTTP_5')
        ) {
          setLoginError(
            apiErr.message?.includes('timed out')
              ? 'The sign-in service timed out. Check your connection and try again.'
              : 'Unable to reach the sign-in service. Check your connection and try again.'
          );
        } else if (
          apiErr.code === 'INVALID_CREDENTIALS' ||
          apiErr.code === 'HTTP_401' ||
          apiErr.code === 'UNAUTHORIZED'
        ) {
          setLoginError('Incorrect email or password. Please verify your credentials.');
        } else {
          setLoginError(apiErr.message || 'Authentication failed. Please try again.');
        }
      } else {
        const message = apiErr instanceof Error ? apiErr.message : '';
        setLoginError(message || 'Authentication failed. Please try again.');
      }
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
      const result = await api.auth.sendVerificationCode({ email: signupEmail.trim().toLowerCase(), name: signupName.trim() });
      if (!result.success) throw new Error(result.error?.message || 'We could not send the verification email.');
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
      if (!res.success || !res.data?.verificationToken) throw new Error(res.error?.message || 'This code could not be verified. Please try again.');
      setVerificationToken(res.data.verificationToken);
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
        try { sessionStorage.removeItem(`pixbe_verified_org_setup:${verifiedEmail || signupEmail.trim().toLowerCase()}`); } catch { /* Storage is optional. */ }
        const { token, tenant, user } = res.data;
        const activeTenantSlug = tenant?.slug || slug;

        if (token) {
          api.setAuth(token, activeTenantSlug, {
            persist: true,
            refreshToken: (res.data as any).refreshToken,
            email: user?.email || resolvedAdminEmail,
          });
          AuthService.setSession({
            token,
            sub: user?.id || (user as any)?.sub || `admin_${Date.now()}`,
            email: user?.email || resolvedAdminEmail,
            role: 'super_admin',
            tenantId: activeTenantSlug,
            dbSchema: tenant?.schema,
            name: user?.name || resolvedAdminName,
            persist: true,
            refreshToken: (res.data as any).refreshToken,
          });
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
  if (mobile || view === 'login' || view === 'signup') {
    const isLogin = mobile || view === 'login';
    const changeAuthView = (next: 'login' | 'signup') => { setSignupNameError(''); setSignupEmailError(''); setSignupPasswordError(''); setLoginError(''); setPasswordMismatch(false); setView(next); };
    return <AuthSplitLayout contentKey={isLogin ? 'login' : 'register'}>
      {!mobile && <div className="fa-tabs" role="tablist" aria-label="Authentication mode"><button type="button" role="tab" aria-selected={isLogin} onClick={() => changeAuthView('login')}>Sign in</button><button type="button" role="tab" aria-selected={!isLogin} onClick={() => changeAuthView('signup')}>Register</button></div>}
      <header className="fa-intro"><h1>{isLogin ? (mobile ? 'Welcome back.' : 'Welcome back') : (mobile ? 'Start something good.' : 'Create your account')}</h1><p>{isLogin ? 'Sign in to your workspace.' : 'Start with your details. Your workspace comes next.'}</p></header>
      <form onSubmit={isLogin ? handleLogin : handleSignup} className={`fa-form ${isLogin ? 'is-login' : 'is-register'}`}>
        <div className="fa-fields">
          {!isLogin && <div className="fa-field"><label htmlFor="auth-name">Full name *</label><input id="auth-name" name="name" autoComplete="name" required value={signupName} onChange={(event) => { setSignupName(event.target.value); setSignupNameError(''); }} placeholder="Your full name" aria-invalid={!!signupNameError} aria-describedby="auth-name-hint"/><small id="auth-name-hint" className={signupNameError ? 'is-error' : ''}>{signupNameError || 'As it should appear to your team.'}</small></div>}
          <div className="fa-field"><label htmlFor="auth-email">Work email *</label><input id="auth-email" name="email" type={isLogin ? 'text' : 'email'} inputMode="email" autoComplete={isLogin ? 'username' : 'email'} autoCapitalize="none" spellCheck={false} required value={isLogin ? loginEmail : signupEmail} onChange={(event) => { if (isLogin) setLoginEmail(event.target.value); else { setSignupEmail(event.target.value); setSignupEmailError(''); } }} placeholder="you@company.com" aria-invalid={!isLogin && !!signupEmailError} aria-describedby="auth-email-hint"/><small id="auth-email-hint" className={!isLogin && signupEmailError ? 'is-error' : ''}>{isLogin ? 'Use the email linked to your workspace.' : signupEmailError || 'We’ll send a verification code to this address.'}</small></div>
          <div className="fa-field"><label htmlFor="auth-password">Password *</label><div className="fa-password"><input id="auth-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} required value={isLogin ? loginPassword : signupPassword} onChange={(event) => { if (isLogin) setLoginPassword(event.target.value); else { setSignupPassword(event.target.value); setSignupPasswordError(''); } }} placeholder={isLogin ? 'Your password' : 'Create a secure password'} aria-invalid={!isLogin && !!signupPasswordError}/><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <Eye size={16}/> : <EyeOff size={16}/>}</button></div><small className={signupPasswordError ? 'is-error' : ''}>{isLogin ? 'Show or hide your password using the eye icon.' : signupPasswordError || 'Password requirements'}</small></div>
          {!isLogin && <><CognitoPasswordPolicyGuide password={signupPassword} showAlways variant="figma"/><div className="fa-field"><label htmlFor="auth-confirm-password">Confirm password *</label><div className="fa-password"><input id="auth-confirm-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" required value={signupConfirmPassword} onChange={(event) => { setSignupConfirmPassword(event.target.value); if (event.target.value === signupPassword) setPasswordMismatch(false); }} placeholder="Re-enter password" aria-invalid={passwordMismatch}/><button type="button" aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>{showConfirmPassword ? <Eye size={16}/> : <EyeOff size={16}/>}</button></div><small className={passwordMismatch ? 'is-error' : ''}>{passwordMismatch ? 'Passwords do not match.' : signupConfirmPassword && signupConfirmPassword === signupPassword ? 'Passwords match.' : 'Re-enter your password to confirm.'}</small></div></>}
          {isLogin && <div className="fa-preferences"><label><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)}/>Remember me</label><button type="button" onClick={() => router.push('/forgot-password')}>Forgot password?</button></div>}
        </div>
        {isLogin && loginError && <p className="fa-error" role="alert">{loginError}</p>}
        <div className="fa-submit-area"><button type="submit" className="fa-primary" disabled={isSubmitting}>{isSubmitting && <Loader2 size={16} className="animate-spin"/>}{isSubmitting ? isLogin ? 'Signing in…' : 'Sending code…' : isLogin ? 'Sign in' : mobile ? 'Create account' : 'Continue to verification'}</button>{!isLogin && <p className="fa-terms">By continuing, you agree to Pixbe’s <span>Terms of service</span> and <span>Privacy policy</span>.</p>}</div>
      </form>
      {isLogin && <section className="fa-student"><h2>Here as a student?</h2><p>Use your institute account to view attendance.</p><button type="button" onClick={() => router.push('/student-login')}>Go to student portal →</button></section>}
    </AuthSplitLayout>;
  }

  if (view === 'otp') {
    const otpComplete = otpDigits.join('').length === 6;
    return <AuthSplitLayout contentKey="otp">
      <div className="fa-tabs" role="tablist" aria-label="Authentication mode"><button type="button" role="tab" aria-selected={false} onClick={() => { setOtpError(''); setView('login'); }}>Sign in</button><button type="button" role="tab" aria-selected={true} onClick={() => setView('signup')}>Register</button></div>
      <div className="fa-mail"><Mail size={20}/></div>
      <header className="fa-intro"><h1>Check your email</h1><p>Enter the six-digit code we sent to:</p></header>
      <div className="fa-destination"><strong>{signupEmail}</strong><button type="button" onClick={() => { setOtpDigits(['','','','','','']); setOtpError(''); setView('signup'); }}>Change email</button></div>
      <form onSubmit={handleVerifyOtp} className="fa-form"><div className="fa-code-field"><label id="verification-code-label">Verification code *</label><div className="fa-code" role="group" aria-labelledby="verification-code-label">{otpDigits.map((digit,index) => <input key={index} ref={(element) => { otpInputRefs.current[index] = element; }} type="text" inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} maxLength={1} value={digit} autoFocus={index === 0} onChange={(event) => handleOtpChange(index,event.target.value)} onKeyDown={(event) => handleOtpKeyDown(index,event)} onPaste={handleOtpPaste} onFocus={(event) => event.target.select()} aria-label={`Digit ${index+1}`} aria-invalid={!!otpError} disabled={isSubmitting}/>)}</div><small>Your code is valid for 10 minutes.</small></div>{otpError && <p className="fa-error" role="alert">{otpError}</p>}<button type="submit" className="fa-primary" disabled={isSubmitting || !otpComplete}>{isSubmitting ? 'Verifying…' : 'Verify email'}</button></form>
      <div className="fa-resend"><p>Didn’t receive it? Check your spam folder or request a new code.</p><button type="button" onClick={handleResendOtp} disabled={otpCooldown > 0 || otpSending || isSubmitting}>{otpSending ? 'Sending…' : otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}</button></div>
    </AuthSplitLayout>;
  }

  // ==========================================
  // VIEW 5: ONBOARDING WIZARD
  // ==========================================
  if (view === 'onboarding') {
    const typeLabel = industry === 'Office' ? 'Company' : industry === 'Institute' ? 'Institute' : customIndustry || 'Other';
    const titleOptions = industry === 'Institute'
      ? [{ value: 'Principal / Dean', label: 'Principal / Dean' }, { value: 'Academic Head', label: 'Academic Head' }, { value: 'Academic Administrator', label: 'Academic Administrator' }, { value: 'Other', label: 'Other' }]
      : industry === 'Office'
        ? [{ value: 'CEO / Executive Owner', label: 'Owner' }, { value: 'HR Manager', label: 'HR' }, { value: 'Operations Lead', label: 'Manager' }, { value: 'Other', label: 'Other' }]
        : [{ value: 'Executive / Owner', label: 'Owner' }, { value: 'Operations Lead', label: 'Manager' }, { value: 'Workspace Administrator', label: 'Administrator' }, { value: 'Other', label: 'Other' }];
    const titleLabel = role === 'Other' ? customRole || 'Other' : titleOptions.find((option) => option.value === role)?.label || role;
    const plan = licensePlans.find((item) => item.id === selectedPlanId);
    const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
    const annualSaving = plan ? Math.max(0, plan.priceMonthly * 12 - plan.priceAnnual) : 0;
    const reviewRows = [
      { label: 'Organisation', value: `${companyName}, ${companySize} people`, edit: 1 },
      { label: 'Registered address', value: [streetAddress,city,stateProvince,postalCode,country].filter(Boolean).join(', '), edit: 1 },
      { label: 'Type & title', value: `${typeLabel}, ${titleLabel}`, edit: 2 },
      { label: 'License', value: `${plan?.name || 'Selected plan'} · ${billingCycle === 'trial' ? `${plan?.trialDays || 14}-day trial` : billingCycle === 'annual' ? `${money(plan?.priceAnnual || 0)} / year` : `${money(plan?.priceMonthly || 0)} / month`}${plan ? ` · ${plan.maxSeats} seats` : ''}`, edit: 4 },
      { label: 'Workspace owner', value: `${signupName}, ${verifiedEmail || signupEmail}`, edit: 0 },
    ];
    return <AuthWizardLayout currentStep={step} onStepChange={(next) => setStep(next as typeof step)} name={signupName} email={verifiedEmail || signupEmail}>
      <div className="fs-form" onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !isSubmitting) { event.preventDefault(); handleNextStep(); } }}>
        {step === 1 && <section className="fs-step">
          <header className="fs-heading"><h2>Tell us about your organisation</h2><p>These details will identify your workspace. You can update them later in settings.</p></header>
          <div className="fs-fields">
            <div className="fs-field"><label htmlFor="org-name">Organisation name *</label><input id="org-name" value={companyName} onChange={(event) => { setCompanyName(event.target.value); setCompanyNameError(''); }} placeholder="Organisation name" aria-invalid={!!companyNameError}/><small className={companyNameError ? 'is-error' : ''}>{companyNameError || 'The name your team will see in Pixbe.'}</small></div>
            <div className="fs-field"><label htmlFor="org-size">Organisation size *</label><select id="org-size" value={companySize} onChange={(event) => setCompanySize(event.target.value)}>{['1-10','11-50','51-100','101-200','201-500','500+'].map((size) => <option key={size} value={size}>{size} people</option>)}</select><small>Choose your total team size, not just your first invitees.</small></div>
            <div className="fs-field"><label htmlFor="org-address">Registered address *</label><input id="org-address" value={streetAddress} onChange={(event) => { setStreetAddress(event.target.value); setAddressError(''); }} placeholder="Street address of your registered office"/><small>Street address of your registered office.</small></div>
            <div className="fs-field-row"><div className="fs-field"><label htmlFor="org-city">City *</label><input id="org-city" value={city} onChange={(event) => { setCity(event.target.value); setAddressError(''); }}/></div><div className="fs-field"><label htmlFor="org-postcode">Postcode *</label><input id="org-postcode" value={postalCode} onChange={(event) => setPostalCode(event.target.value)}/></div></div>
            <div className="fs-field fs-country-field"><label htmlFor="org-country">Country *</label><select id="org-country" value={country} onChange={(event) => { setCountry(event.target.value); setAddressError(''); }}>{!WORLD_COUNTRIES.includes(country) && country && <option>{country}</option>}{WORLD_COUNTRIES.map((name) => <option key={name}>{name}</option>)}</select><details className="fs-extra"><summary>More details</summary><div><div className="fs-field"><label htmlFor="org-domain">Domain (optional)</label><input id="org-domain" value={companyDomain} onChange={(event) => { setCompanyDomain(event.target.value); setDomainError(''); }} placeholder="company.com"/>{domainError && <small className="is-error">{domainError}</small>}</div><div className="fs-field"><label htmlFor="org-province">State / Province (optional)</label><input id="org-province" value={stateProvince} onChange={(event) => setStateProvince(event.target.value)}/></div></div></details></div>
          </div>
          {addressError && <p className="fa-error" role="alert">{addressError}</p>}
          <aside className="fs-notice"><p>Your registered address stays private to workspace administrators.</p></aside>
        </section>}
        {step === 2 && <section className="fs-step"><header className="fs-heading"><h2>What kind of organisation are you?</h2><p>We’ll use this to tailor roles and setup options for {companyName || 'your workspace'}.</p></header><div className="fs-type-field"><label>Organisation type *</label><div className="fs-type-options" role="radiogroup" aria-label="Workspace type">{([{ key: 'Office', title: 'Company', detail: 'Bring teams, projects and operations together.' }, { key: 'Institute', title: 'Institute', detail: 'Connect departments, faculty and learners.' }, { key: 'Other', title: 'Other', detail: 'For nonprofits, associations and other organisations.' }] as const).map((item) => <button type="button" role="radio" aria-checked={industry === item.key} className="fs-choice" key={item.key} onClick={() => { setIndustry(item.key); setRole(item.key === 'Institute' ? 'Principal / Dean' : item.key === 'Office' ? 'CEO / Executive Owner' : 'Executive / Owner'); }}><WorkspaceTypeIcon kind={item.key}/><strong>{item.title}</strong><span>{item.detail}</span><i aria-hidden="true"/></button>)}</div></div>{industry === 'Other' && <div className="fs-field"><label htmlFor="org-custom-type">Organisation type *</label><input id="org-custom-type" value={customIndustry} onChange={(event) => setCustomIndustry(event.target.value)} placeholder="Describe your organisation"/></div>}<aside className="fs-notice"><strong>{typeLabel} selected</strong><p>Next, choose your title at {companyName || 'your workspace'}.{industry === 'Office' ? ' Company roles include Owner, HR and Manager.' : ''}</p></aside><p className="fs-hint">For schools and colleges, choose Institute to use education-specific roles.</p></section>}
        {step === 3 && <section className="fs-step"><header className="fs-heading"><h2>What’s your role?</h2><p>Choose the title that best describes your role at {companyName || 'your workspace'}.</p></header><aside className="fs-notice fs-context-choice"><div><p>Organisation type</p><strong>{typeLabel}, {companyName}</strong></div><button type="button" onClick={() => setStep(2)}>Change</button></aside><div><label className="fs-group-label">Your title *</label><div className="fs-title-options" role="radiogroup" aria-label="Your title">{titleOptions.map((option) => <button key={option.value} type="button" role="radio" aria-checked={role === option.value} onClick={() => setRole(option.value)}>{role === option.value && <Check size={14}/>} {option.label}</button>)}</div><p className="fs-hint">Showing titles for {industry === 'Office' ? 'a company' : industry === 'Institute' ? 'an institute' : 'your organisation'}. Select one to continue.</p></div>{role === 'Other' && <div className="fs-field"><label htmlFor="org-custom-title">Your title *</label><input id="org-custom-title" value={customRole} onChange={(event) => setCustomRole(event.target.value)} placeholder="Your title"/></div>}<aside className="fs-notice"><strong>You’ll be the workspace owner</strong><p>You can manage billing, invite people and assign access. Titles and team permissions can be changed in settings.</p></aside><p className="fs-hint">Setting up an institute instead? Choose Institute in the previous step for titles such as Principal, Administrator and Faculty.</p></section>}
        {step === 4 && <section className="fs-step"><header className="fs-heading"><h2>Choose your workspace plan</h2><p>{plan ? `Start with ${plan.maxSeats} seats for ${companyName || 'your workspace'}. You can add more seats as your team grows.` : 'Choose a plan for your workspace.'}</p></header>{licensePlans.length > 1 && <div className="fs-field"><label htmlFor="org-license-product">Workspace plan</label><select id="org-license-product" value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)}>{licensePlans.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></div>}{plansLoading ? <p className="fs-hint" role="status">Loading plans…</p> : <div className="fs-license-options" role="radiogroup" aria-label="License phase">{(['trial','monthly','annual'] as const).map((cycle) => <button type="button" role="radio" aria-checked={billingCycle === cycle} disabled={!plan} key={cycle} className="fs-license-card" onClick={() => { setBillingCycle(cycle); setOnboardingError(''); }}><header><strong>{cycle === 'trial' ? 'Trial' : cycle === 'monthly' ? 'Monthly' : 'Annual'}</strong><i aria-hidden="true"/></header><div><span className="fs-price">{cycle === 'trial' ? money(0) : plan ? money(cycle === 'annual' ? plan.priceAnnual : plan.priceMonthly) : '—'}</span><p>{cycle === 'trial' ? `for ${plan?.trialDays || 14} days` : cycle === 'annual' ? 'per year' : 'per month'}</p><strong className="fs-seat-count">{plan?.maxSeats || '—'} seats{cycle === 'trial' ? ', no card required' : ''}</strong></div><ul>{(plan?.features || []).slice(0,3).map((feature) => <li key={feature}><Check size={15}/><span>{feature}</span></li>)}</ul></button>)}</div>}<p className="fs-hint">Prices and available seats are supplied by your selected workspace plan.</p><aside className="fs-notice"><strong>{billingCycle === 'annual' ? `Annual selected${annualSaving ? `, Save ${money(annualSaving)} a year` : ''}` : billingCycle === 'monthly' ? 'Monthly selected' : 'Trial selected'}</strong><p>{billingCycle === 'annual' && plan ? `${money(plan.priceAnnual)} billed yearly for ${plan.maxSeats} seats. ` : billingCycle === 'monthly' && plan ? `${money(plan.priceMonthly)} billed monthly for ${plan.maxSeats} seats. ` : `Try your workspace for ${plan?.trialDays || 14} days. `}You’ll add billing details during workspace setup; nothing is charged now.</p></aside></section>}
        {step === 5 && <section className="fs-step"><header className="fs-heading"><h2>Ready to open {companyName || 'your workspace'}?</h2><p>Review your details before creating your workspace. You can go back to make changes.</p></header><section className="fs-summary"><header><div><h3>{companyName}</h3><p>{typeLabel} workspace</p></div><BadgeCheck size={20}/></header><dl>{reviewRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd>{row.edit ? <button type="button" onClick={() => setStep(row.edit as typeof step)}>Edit</button> : <span/>}</div>)}</dl></section><aside className="fs-notice"><strong>Your workspace, your next step</strong><p>Creating your workspace won’t invite anyone or charge your card. We’ll guide you through billing and team setup next.</p></aside></section>}
        {onboardingError && <p className="fa-error" role="alert">{onboardingError}</p>}
        <div className="fs-actions"><button type="button" className="fs-secondary" onClick={() => step === 1 ? setView('signup') : setStep((previous) => Math.max(1,previous-1) as typeof previous)}>Back</button><button type="button" className="fs-primary" disabled={isSubmitting || step === 4 && !selectedPlanId} onClick={handleNextStep}>{isSubmitting ? 'Creating…' : step === 5 ? 'Create workspace' : 'Continue'}</button></div>
        {step === 5 && <p className="fs-hint fs-after-action">Next, finish setup, add billing details and invite your team.</p>}
      </div>
    </AuthWizardLayout>;
  }

  return null;
};
