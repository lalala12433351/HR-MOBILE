'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { UserPersona, Role, Employee, Student } from '@/types';

import { api } from '@/services/apiClient';
import { getDefaultState, AppState, saveStoredState } from '@/services/store';
import { CognitoPasswordPolicyGuide } from '@/components/auth/CognitoPasswordPolicyGuide';
import { evaluateCognitoPassword } from '@/utils/cognitoPasswordPolicy';
import { fromApiAuthRole } from '@/utils/roleMapping';

interface AuthOnboardingViewProps {
  initialView?: 'login' | 'signup' | 'otp' | 'reset_password' | 'update_password' | 'onboarding';
  onComplete?: (targetRoute?: string) => void;
}

export const AuthSplitLayout: React.FC<{
  children: React.ReactNode;
  maxWidth?: string;
  contentKey?: string;
}> = ({ children, maxWidth = 'max-w-[400px]', contentKey }) => {
  return (
    <div className="auth-shell min-h-screen w-full flex flex-col justify-center items-center bg-[#f7f8fb] text-[var(--auth-ink)] font-sans overflow-x-hidden relative">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.55]"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 70% 45% at 100% 0%, rgba(37,99,235,0.07), transparent 55%), radial-gradient(ellipse 50% 35% at 0% 100%, rgba(14,165,233,0.05), transparent 50%)',
        }}
      />
      <div className={`${maxWidth} relative w-full my-auto px-6 py-10 sm:px-8 space-y-6`}>
        <div>
          <span className="text-lg font-extrabold tracking-[-0.03em] text-[var(--auth-ink)]">Pixbe</span>
        </div>
        <div key={contentKey} className="auth-form-enter space-y-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export const AuthOnboardingView: React.FC<AuthOnboardingViewProps> = ({
  initialView = 'login',
  onComplete,
}) => {
  const router = useRouter();
  const { state, updateState, selectPersona, triggerToast, syncWithBackend } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [view, setView] = useState<'login' | 'signup' | 'otp' | 'reset_password' | 'update_password' | 'onboarding'>(initialView);

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

  // Password Reset State
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Visibility Toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Onboarding Steps (1 to 4)
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

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

  const handleNextStep = () => {
    if (step === 1) {
      let hasErr = false;
      if (!companyName.trim()) {
        setCompanyNameError('Company name is required');
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

      if (hasErr) return;
    }

    if (step < 4) {
      setStep((prev) => (prev + 1) as any);
    } else {
      handleCompleteOnboarding();
    }
  };

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError('');

    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPassword = loginPassword.trim();

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
          department: (user.department as any) || (isSuper ? 'Operations' : 'General Operations'),
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

  const handleSignup = (e: React.FormEvent) => {
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

    // Check for JIT Provisioning (User exists in DB but is Not Activated)
    const existingEmployee = (state.employees || []).find(
      (e) => e.email?.toLowerCase() === signupEmail.toLowerCase() && (e.accountStatus === 'Not Activated' || !e.isActivated)
    );

    if (existingEmployee) {
      const updatedEmployees = (state.employees || []).map((emp) =>
        emp.id === existingEmployee.id
          ? { ...emp, isActivated: true, accountStatus: 'Active' as const, hasCompletedProfile: false }
          : emp
      );

      const activePersona: UserPersona = {
        id: existingEmployee.id,
        name: signupName || existingEmployee.name,
        email: existingEmployee.email || signupEmail,
        password: signupPassword,
        role: (existingEmployee.role as Role) || 'employee',
        designation: existingEmployee.designation || 'Team Member',
        department: (existingEmployee.department as any) || 'Operations',
        avatar: existingEmployee.avatar || '',
      };

      const nextFullState: AppState = {
        ...state,
        isAuthenticated: true,
        currentPersona: activePersona,
        employees: updatedEmployees,
      };

      selectPersona(activePersona);
      updateState(() => nextFullState);
      saveStoredState(nextFullState);

      if (onComplete) {
        onComplete('/employee-onboarding');
      }
      return;
    }

    // Proceed directly to workspace onboarding wizard (no email verification screen)
    setView('onboarding');
    setStep(1);
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

  const handleVerifyOtp = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const fullOtp = otpDigits.join('');
    if (fullOtp.length < 6) {
      setOtpError('Enter the 6-digit verification code');
      return;
    }
    setOtpError('');
    setView('onboarding');
    setStep(1);
  };

  const handleResendOtp = () => {
    setOtpDigits(['', '', '', '', '', '']);
    otpInputRefs.current[0]?.focus();
    triggerToast({
      title: 'Code Sent',
      message: `A verification code was sent to ${signupEmail || 'your email'}.`,
      type: 'system',
    });
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
          department: (isInst ? 'Administration' : 'Operations') as any,
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
          department: (isInst ? 'Administration' : 'Operations') as any,
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
          workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        };

        const nextFullState: AppState = {
          ...fresh,
          isAuthenticated: true,
          organization: newOrg,
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
          title: 'Workspace Ready',
          message: `${tenant?.name || companyName || 'Workspace'} initialized successfully (Tenant: ${activeTenantSlug})`,
          type: 'system',
        });

        if (onComplete) {
          onComplete(isInst ? '/setup-students' : '/setup');
        }
      } else {
        const errorMsg = (res as any)?.error?.message || 'AWS Cognito registration failed.';
        api.clearAuth();
        console.error('[Multi-Tenant] Backend registration returned error:', errorMsg);
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
        <div className="space-y-2">
          <h2 className="text-[1.75rem] sm:text-[1.9rem] font-extrabold tracking-[-0.035em] text-[var(--auth-ink)]">
            {isLogin ? 'Welcome back' : 'Create your workspace'}
          </h2>
          <p className="text-sm text-[var(--auth-muted)] font-medium leading-relaxed">
            {isLogin
              ? 'Sign in to continue managing your team.'
              : 'Set up Pixbe and start running HR in one place.'}
          </p>
        </div>

        <div className="auth-mode-track" role="tablist" aria-label="Authentication mode">
          <div className="auth-mode-thumb" data-mode={isLogin ? 'login' : 'signup'} aria-hidden="true" />
          <button
            type="button"
            role="tab"
            aria-selected={isLogin}
            data-active={isLogin}
            className="auth-mode-btn"
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
            data-active={!isLogin}
            className="auth-mode-btn"
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

        {isLogin && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400">Quick demo</span>
            <button
              type="button"
              onClick={() => {
                setLoginEmail('admin@demo.com');
                setLoginPassword('admin123');
                setLoginError('');
              }}
              className="auth-chip"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => router.push('/student-login')}
              className="auth-chip"
            >
              Student portal
            </button>
          </div>
        )}

        <form onSubmit={isLogin ? handleLogin : handleSignup} className="space-y-3.5">
          {!isLogin && (
            <div className="space-y-1.5">
              <label className="block text-[12px] font-semibold text-slate-700">
                Full name
              </label>
              <input
                type="text"
                required
                value={signupName}
                onChange={(e) => {
                  setSignupName(e.target.value);
                  if (signupNameError) setSignupNameError('');
                }}
                placeholder="Enter your full name"
                data-invalid={Boolean(signupNameError)}
                className="auth-field"
              />
              {signupNameError && (
                <p className="text-[11px] font-semibold text-red-600">
                  {signupNameError}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-[12px] font-semibold text-slate-700">
              Email address
            </label>
            <input
              type={isLogin ? 'text' : 'email'}
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
              placeholder="e.g. sarah.johnson@email.com"
              data-invalid={!isLogin && Boolean(signupEmailError)}
              className="auth-field"
            />
            {!isLogin && signupEmailError && (
              <p className="text-[11px] font-semibold text-red-600">
                {signupEmailError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-[12px] font-semibold text-slate-700">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
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
                placeholder={isLogin ? 'Enter your password' : 'Create a strong password (8+ chars)'}
                data-invalid={!isLogin && Boolean(signupPasswordError)}
                className="auth-field pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 transition-colors duration-150 cursor-pointer hover:text-slate-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>

            {!isLogin && (
              <>
                <CognitoPasswordPolicyGuide password={signupPassword} showAlways={signupPassword.length > 0} />
                {signupPasswordError && (
                  <p className="text-[11px] font-semibold text-red-600 mt-1">
                    {signupPasswordError}
                  </p>
                )}
              </>
            )}
          </div>

          {!isLogin && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[12px] font-semibold text-slate-700">
                  Confirm password
                </label>
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 cursor-pointer transition-colors duration-150"
                >
                  {showConfirmPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={signupConfirmPassword}
                onChange={(e) => {
                  const val = e.target.value;
                  setSignupConfirmPassword(val);
                  if (val === signupPassword) setPasswordMismatch(false);
                }}
                placeholder="Re-enter your password"
                data-invalid={passwordMismatch}
                className="auth-field"
              />
              {passwordMismatch && (
                <p className="text-[11px] font-medium text-red-600">
                  Passwords do not match
                </p>
              )}
            </div>
          )}

          {isLogin && (
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[var(--auth-accent)] focus:ring-[var(--auth-accent)] cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-600">
                  Remember me
                </span>
              </label>
              <button
                type="button"
                onClick={() => setView('reset_password')}
                className="text-sm font-semibold text-[var(--auth-accent)] transition-colors duration-150 cursor-pointer hover:text-[var(--auth-accent-deep)]"
              >
                Forgot password?
              </button>
            </div>
          )}

          {isLogin && loginError && (
            <div className="p-3 rounded-[10px] bg-red-50 border border-red-200 text-red-600 text-xs font-semibold text-center flex items-center justify-center gap-2">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{loginError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="auth-btn-primary mt-1"
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>{isLogin ? 'Sign in' : 'Continue'}</span>
            )}
          </button>
        </form>
      </AuthSplitLayout>
    );
  }

  // ==========================================
  // VIEW 2: OTP EMAIL VERIFICATION (Bypassed)
  // ==========================================
  if (view === 'otp') {
    setView('onboarding');
    setStep(1);
    return null;
  }

  // ==========================================
  // VIEW 3: RESET PASSWORD
  // ==========================================
  if (view === 'reset_password') {
    return (
      <AuthSplitLayout contentKey="reset">
        <div className="space-y-2">
          <h2 className="text-[1.75rem] sm:text-[1.9rem] font-extrabold tracking-[-0.035em] text-[var(--auth-ink)]">
            Reset password
          </h2>
          <p className="text-sm text-[var(--auth-muted)] font-medium leading-relaxed">
            Enter your registered email and we&apos;ll send reset instructions.
          </p>
        </div>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="block text-[12px] font-semibold text-slate-700">
              Registered email
            </label>
            <input
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="e.g. sarah.johnson@email.com"
              className="auth-field"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              triggerToast({ title: 'Instructions Sent', message: 'If an account exists, instructions were sent.', type: 'system' });
              setView('update_password');
            }}
            className="auth-btn-primary"
          >
            Send reset link
          </button>

          <button
            type="button"
            onClick={() => setView('login')}
            className="auth-btn-secondary"
          >
            Back to sign in
          </button>
        </div>
      </AuthSplitLayout>
    );
  }

  // ==========================================
  // VIEW 4: UPDATE PASSWORD
  // ==========================================
  if (view === 'update_password') {
    return (
      <AuthSplitLayout contentKey="update">
        <div className="space-y-2">
          <h2 className="text-[1.75rem] sm:text-[1.9rem] font-extrabold tracking-[-0.035em] text-[var(--auth-ink)]">
            Set new password
          </h2>
          <p className="text-sm text-[var(--auth-muted)] font-medium leading-relaxed">
            Choose a strong password with at least 8 characters.
          </p>
        </div>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[12px] font-semibold text-slate-700">
                New password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 cursor-pointer transition-colors duration-150"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters (mixed case, number, symbol)"
              className="auth-field"
            />
            <CognitoPasswordPolicyGuide password={newPassword} showAlways={newPassword.length > 0} />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-[12px] font-semibold text-slate-700">
                Confirm new password
              </label>
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="text-[11px] font-semibold text-slate-400 hover:text-slate-700 cursor-pointer transition-colors duration-150"
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="auth-field"
            />
          </div>

          <button
            type="button"
            onClick={async () => {
              const targetIdent = resetEmail.trim().toLowerCase();
              const cleanPass = newPassword.trim();

              const strength = evaluateCognitoPassword(cleanPass);
              if (!strength.isValid) {
                triggerToast({
                  title: 'Password Policy Error',
                  message: `New password must meet security requirements. Missing: ${strength.missingRequirements.join(', ')}.`,
                  type: 'system',
                });
                return;
              }

              if (cleanPass !== confirmPassword.trim()) {
                triggerToast({
                  title: 'Passwords Mismatch',
                  message: 'New password and confirm password do not match. Please verify.',
                  type: 'system',
                });
                return;
              }

              if (targetIdent) {
                const allStudents = state.students || [];
                const matchedStudent = allStudents.find(
                  (s) =>
                    s.name.toLowerCase() === targetIdent ||
                    s.email?.toLowerCase() === targetIdent ||
                    s.studentId?.toLowerCase() === targetIdent ||
                    s.rollNumber?.toLowerCase() === targetIdent
                );

                const matchedEmp = (state.employees || []).find(
                  (e) =>
                    e.email?.toLowerCase() === targetIdent ||
                    e.id?.toLowerCase() === targetIdent ||
                    e.employeeId?.toLowerCase() === targetIdent ||
                    e.name?.toLowerCase() === targetIdent
                );

                updateState((prev) => {
                  const nextStudents = (prev.students || []).map((s) => {
                    const isMatch =
                      s.name.toLowerCase() === targetIdent ||
                      s.email?.toLowerCase() === targetIdent ||
                      s.studentId?.toLowerCase() === targetIdent ||
                      s.rollNumber?.toLowerCase() === targetIdent;
                    return isMatch
                      ? { ...s, password: cleanPass, hasResetPassword: true, isActivated: true }
                      : s;
                  });

                  const nextEmployees = (prev.employees || []).map((e) => {
                    const isMatch =
                      e.email?.toLowerCase() === targetIdent ||
                      e.id?.toLowerCase() === targetIdent ||
                      e.employeeId?.toLowerCase() === targetIdent ||
                      e.name?.toLowerCase() === targetIdent;
                    return isMatch
                      ? {
                          ...e,
                          password: cleanPass,
                          isActivated: true,
                          hasResetPassword: true,
                          accountStatus: 'Active' as const,
                        }
                      : e;
                  });

                  const isCurrentPersonaMatch =
                    prev.currentPersona?.email?.toLowerCase() === targetIdent ||
                    prev.currentPersona?.id?.toLowerCase() === targetIdent ||
                    prev.currentPersona?.name?.toLowerCase() === targetIdent;

                  const nextCurrentPersona = isCurrentPersonaMatch
                    ? { ...prev.currentPersona, password: cleanPass }
                    : prev.currentPersona;

                  const nextState: AppState = {
                    ...prev,
                    employees: nextEmployees,
                    students: nextStudents,
                    currentPersona: nextCurrentPersona,
                  };

                  saveStoredState(nextState);
                  return nextState;
                });

                // Sync password reset with live PostgreSQL backend
                try {
                  await api.auth.resetPassword({
                    email: targetIdent,
                    newPassword: cleanPass,
                  });
                } catch (apiErr) {
                  console.debug('Public password reset sync note:', apiErr);
                }

                if (matchedEmp) {
                  try {
                    await api.identity.updateEmployee(matchedEmp.id, {
                      password: cleanPass,
                      email: matchedEmp.email,
                      isActivated: true,
                      accountStatus: 'Active',
                    });
                  } catch (_) {}
                }
              }

              setLoginEmail(resetEmail.trim());
              setLoginPassword(cleanPass);

              triggerToast({
                title: 'Password Updated',
                message: 'Your new security password has been configured and saved. You can now sign in.',
                type: 'system',
              });
              setView('login');
            }}
            className="auth-btn-primary"
          >
            Update password
          </button>
        </div>
      </AuthSplitLayout>
    );
  }

  // ==========================================
  // VIEW 5: ONBOARDING WIZARD
  // ==========================================
  if (view === 'onboarding') {
    return (
      <AuthSplitLayout maxWidth="max-w-[480px]" contentKey="onboarding">
        {/* Top Progress Indicator */}
        <div className="w-full space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span className="text-slate-700 font-bold">Workspace setup</span>
            <span>Step {step} of 4</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-[background-color] duration-200 ease-out ${
                  i <= step ? 'bg-[var(--auth-accent)]' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Main Form Content */}
        <div className="w-full py-4 space-y-6">
          {/* STEP 1: Company / Institution Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Organization Info
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Enter your organization name and size
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Company / School Name
                  </label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value);
                      if (e.target.value.trim()) setCompanyNameError('');
                    }}
                    placeholder="e.g. Acme Corp or St. Jude Academy"
                    className={`w-full rounded-xl border bg-[#f8fafc] hover:bg-white focus:bg-white px-4 py-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all font-medium ${
                      companyNameError
                        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'
                    }`}
                  />
                  {companyNameError && (
                    <p className="text-[11px] font-medium text-red-600 mt-1">
                      {companyNameError}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Domain Name <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={companyDomain}
                    onChange={(e) => {
                      setCompanyDomain(e.target.value);
                      if (e.target.value && !validateDomain(e.target.value)) {
                        setDomainError('');
                      }
                    }}
                    placeholder="e.g. company.com or school.edu"
                    className={`w-full rounded-xl border bg-[#f8fafc] hover:bg-white focus:bg-white px-4 py-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all font-medium ${
                      domainError
                        ? 'border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
                        : 'border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10'
                    }`}
                  />
                  {domainError && (
                    <p className="text-[11px] font-medium text-red-600 mt-1">
                      {domainError}
                    </p>
                  )}
                </div>

                <div className="pt-2 space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Total Members / Headcount
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {['1-10', '11-50', '51-100', '101-200', '201-500', '500+'].map((size) => {
                      const isSel = companySize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setCompanySize(size)}
                          className={`py-2 px-1 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer ${
                            isSel
                              ? 'border-blue-600 bg-blue-600 text-white shadow-xs'
                              : 'border-slate-200 bg-[#f8fafc] text-slate-700 hover:bg-white hover:border-slate-300'
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Workspace Category / Template */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Workspace Template
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Select your workspace template category
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {[
                  { key: 'Office', title: 'Office / Corporate', desc: 'Companies, startups, agencies, and businesses with team departments' },
                  { key: 'Institute', title: 'Institute / Education', desc: 'Schools, colleges, universities, and academic centers with classrooms & batches' },
                  { key: 'Other', title: 'Other / Custom Workspace', desc: 'Healthcare, retail, hospitality, non-profit, or custom organizational operations' },
                ].map((item) => {
                  const isSel = industry === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setIndustry(item.key);
                        if (item.key === 'Institute') {
                          setRole('Principal / Dean');
                        } else if (item.key === 'Office') {
                          setRole('CEO / Executive Owner');
                        } else {
                          setRole('Executive / Owner');
                        }
                      }}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer space-y-1.5 ${
                        isSel
                          ? 'border-blue-600 bg-blue-50/70 text-slate-900 shadow-xs ring-1 ring-blue-500'
                          : 'border-slate-200 bg-[#f8fafc] text-slate-800 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-sm text-slate-900">{item.title}</div>
                      <p className="text-xs leading-relaxed text-slate-600">
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {industry === 'Other' && (
                <div className="space-y-1.5 pt-1 animate-fade-in">
                  <label className="block text-xs font-semibold text-slate-700">
                    Specify Organization / Industry Type
                  </label>
                  <input
                    type="text"
                    value={customIndustry}
                    onChange={(e) => setCustomIndustry(e.target.value)}
                    placeholder="e.g. Healthcare Clinic, Retail Chain, Non-Profit Organization"
                    className="w-full rounded-xl border border-slate-200/90 bg-[#F5F8FC] hover:bg-white focus:bg-white px-4 py-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all font-medium"
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Role Selection */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Your Role
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-1">
                  Select your primary administrative position
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {(industry === 'Institute'
                  ? [
                      { roleName: 'Principal / Dean', tag: 'Administrator' },
                      { roleName: 'Academic Head', tag: 'Management' },
                      { roleName: 'Teacher / Faculty', tag: 'Faculty' },
                      { roleName: 'Student', tag: 'Student Portal' },
                      { roleName: 'Other', tag: 'Custom Position' },
                    ]
                  : industry === 'Office'
                  ? [
                      { roleName: 'CEO / Executive Owner', tag: 'Administrator' },
                      { roleName: 'HR Manager', tag: 'Human Resources' },
                      { roleName: 'Department Manager', tag: 'Management' },
                      { roleName: 'Staff Member', tag: 'Employee' },
                      { roleName: 'Other', tag: 'Custom Position' },
                    ]
                  : [
                      { roleName: 'Executive / Owner', tag: 'Administrator' },
                      { roleName: 'Operations Lead', tag: 'Management' },
                      { roleName: 'Team Member', tag: 'Staff' },
                      { roleName: 'Other', tag: 'Custom Position' },
                    ]
                ).map((item) => {
                  const isSel = role === item.roleName;
                  return (
                    <button
                      key={item.roleName}
                      type="button"
                      onClick={() => setRole(item.roleName)}
                      className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                        isSel
                          ? 'border-blue-600 bg-blue-50/70 text-slate-900 shadow-xs ring-1 ring-blue-500'
                          : 'border-slate-200 bg-[#f8fafc] text-slate-800 hover:bg-white hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-xs text-slate-900">{item.roleName}</div>
                        <span className="text-[10px] text-slate-500">
                          {item.tag}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {role === 'Other' && (
                <div className="space-y-1.5 pt-1 animate-fade-in">
                  <label className="block text-xs font-semibold text-slate-700">
                    Specify Your Role Title
                  </label>
                  <input
                    type="text"
                    value={customRole}
                    onChange={(e) => setCustomRole(e.target.value)}
                    placeholder={
                      industry === 'Institute'
                        ? 'e.g. Registrar, Campus Director, Counselor'
                        : 'e.g. Operations Director, Project Lead, Specialist'
                    }
                    className="w-full rounded-xl border border-slate-200/90 bg-[#F5F8FC] hover:bg-white focus:bg-white px-4 py-3 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 transition-all font-medium"
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Ready to Complete */}
          {step === 4 && (
            <div className="space-y-4 text-center py-4">
              <div className="space-y-1.5">
                <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  Ready to Launch
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Your workspace for <strong className="text-slate-900">{companyName || 'your organization'}</strong> is ready to be initialized.
                </p>
              </div>

              {onboardingError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold text-center animate-fade-in flex items-center justify-center gap-2 max-w-sm mx-auto">
                  <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{onboardingError}</span>
                </div>
              )}
            </div>
          )}

          {/* Navigation Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            {step === 1 ? (
              <button
                type="button"
                onClick={() => setView('login')}
                className="px-5 py-2.5 rounded-[10px] border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer transition-[transform,background-color] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97]"
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep((prev) => Math.max(1, prev - 1) as any)}
                className="px-5 py-2.5 rounded-[10px] border border-slate-200 bg-white text-xs font-semibold text-slate-700 cursor-pointer transition-[transform,background-color] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97]"
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handleNextStep}
              disabled={isSubmitting}
              className="auth-btn-primary !w-auto px-6 py-2.5 text-xs"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Provisioning...</span>
                </>
              ) : (
                <span>{step === 4 ? 'Launch workspace' : 'Continue'}</span>
              )}
            </button>
          </div>
        </div>
      </AuthSplitLayout>
    );
  }

  return null;
};
