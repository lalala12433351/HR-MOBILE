'use client';
import { UserAvatar } from '@/components/common/UserAvatar';
import { DateInput } from '@/components/common/DateInput';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { AlertCircle, Check, Eye, EyeOff, Trash2, UploadCloud } from 'lucide-react';
import { PixbeDesignWordmark as PixbeWordmark } from '@/components/common/PixbeBrand';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/apiClient';
import { saveStoredState } from '@/services/store';
import { WORLD_COUNTRIES, WORLD_NATIONALITIES } from '@/data/nations';
import {
  getCitiesForState,
  getStatesForCountry,
  hasLocationSelects,
} from '@/data/locations';
import {
  isOnboardingFieldEnabled,
  isOnboardingFieldRequired,
  resolveOnboardingFields,
  sectionHasEnabledFields,
} from '@/utils/onboardingFields';
import { CognitoPasswordPolicyGuide } from '@/components/auth/CognitoPasswordPolicyGuide';
import { evaluateCognitoPassword } from '@/utils/cognitoPasswordPolicy';
import type { CustomProfileField, Employee, OnboardingSectionKey, UserPersona } from '@/types';
import './setup/workspace-setup.css';
import './setup/onboarding-studio.css';
import './setup/figma-onboarding.css';
import { OnboardingAccount, OnboardingHelp } from './setup/OnboardingChrome';

interface EmployeeOnboardingViewProps {
  employeeId?: string;
  onComplete?: () => void;
}

type StepKey = 'password' | 'personal' | 'address' | 'banking' | 'documents' | 'review';

const STEP_TITLES: Record<StepKey, string> = {
  password: 'Set a password',
  personal: 'Personal details',
  address: 'Address & emergency contact',
  banking: 'Banking & tax',
  documents: 'Upload documents',
  review: 'Review & finish',
};

const DEFAULT_GENDER_OPTIONS = ['Male', 'Female', 'Non-Binary', 'Prefer not to say'];

const requiredMark = (required: boolean) => (required ? ' *' : '');

export const EmployeeOnboardingView: React.FC<EmployeeOnboardingViewProps> = ({
  employeeId,
  onComplete,
}) => {
  const { state, updateState, triggerToast, selectPersona, syncWithBackend } = useApp();

  const targetEmployee = useMemo(() => {
    if (employeeId) {
      const found = state.employees.find((e) => e.id === employeeId || e.employeeId === employeeId);
      if (found) return found;
    }
    const persona = state.currentPersona;
    const currentMatch = (state.employees || []).find(
      (e) =>
        (persona?.id && e.id === persona.id) ||
        (persona?.email && e.email?.toLowerCase() === persona.email.toLowerCase())
    );
    if (currentMatch) return currentMatch;
    return undefined;
  }, [employeeId, state.employees, state.currentPersona]);

  const configuredFields = useMemo(
    () => resolveOnboardingFields(state.customOptions?.onboardingFields),
    [state.customOptions?.onboardingFields]
  );

  const documentFields = useMemo(
    () => configuredFields.filter((f) => f.enabled && f.section === 'documents'),
    [configuredFields]
  );

  const hasBanking = sectionHasEnabledFields(configuredFields, 'banking');
  const hasDocuments = documentFields.length > 0;

  const steps = useMemo(() => {
    const list: { key: StepKey; label: string }[] = [
      { key: 'password', label: 'Password' },
      { key: 'personal', label: 'Personal' },
      { key: 'address', label: 'Address' },
    ];
    if (hasBanking) list.push({ key: 'banking', label: 'Banking' });
    if (hasDocuments) list.push({ key: 'documents', label: 'Documents' });
    list.push({ key: 'review', label: 'Review' });
    return list;
  }, [hasBanking, hasDocuments]);

  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)]?.key ?? 'password';

  useEffect(() => {
    setStepIndex((prev) => Math.min(prev, steps.length - 1));
  }, [steps.length]);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [stepError, setStepError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [nationality, setNationality] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [healthInsurance, setHealthInsurance] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');

  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateProvince, setStateProvince] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('India');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [personalTaxId, setPersonalTaxId] = useState('');
  const [socialInsurance, setSocialInsurance] = useState('');
  const [pfUanNumber, setPfUanNumber] = useState('');
  const [esiNumber, setEsiNumber] = useState('');

  const [uploadedFiles, setUploadedFiles] = useState<
    Record<string, { id: string; name: string; size: string; type: string; uploadDate: string }>
  >({});
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [agreedToDeclaration, setAgreedToDeclaration] = useState(false);

  const fieldEnabled = (name: string) => isOnboardingFieldEnabled(configuredFields, name);
  const fieldRequired = (name: string) => isOnboardingFieldRequired(configuredFields, name);
  const genderOptions =
    configuredFields.find((f) => f.name === 'gender')?.options?.length
      ? (configuredFields.find((f) => f.name === 'gender')!.options as string[])
      : DEFAULT_GENDER_OPTIONS;

  const useLocationSelects = hasLocationSelects(country);
  const stateOptions = useMemo(() => getStatesForCountry(country), [country]);
  const cityOptions = useMemo(
    () => getCitiesForState(country, stateProvince),
    [country, stateProvince]
  );

  useEffect(() => {
    if (!targetEmployee) return;
    setFullName(targetEmployee.name || targetEmployee.fullName || '');
    setEmail(targetEmployee.email || '');
    setPhone(targetEmployee.phone && targetEmployee.phone !== '—' ? targetEmployee.phone : '');
    if (targetEmployee.dateOfBirth) setDateOfBirth(targetEmployee.dateOfBirth);
    if (targetEmployee.gender && targetEmployee.gender !== 'None' && targetEmployee.gender !== '—') {
      setGender(targetEmployee.gender);
    }
    if (targetEmployee.bloodGroup) setBloodGroup(targetEmployee.bloodGroup);
    if (targetEmployee.maritalStatus) setMaritalStatus(targetEmployee.maritalStatus);
    if (targetEmployee.nationality) setNationality(targetEmployee.nationality);
    if (targetEmployee.personalEmail) setPersonalEmail(targetEmployee.personalEmail);
    if (targetEmployee.healthInsurance) setHealthInsurance(targetEmployee.healthInsurance);
    if (targetEmployee.bio) setBio(targetEmployee.bio);
    if (targetEmployee.avatar) setAvatar(targetEmployee.avatar);
    if (targetEmployee.primaryAddress) setStreetAddress(targetEmployee.primaryAddress);
    if (targetEmployee.city) setCity(targetEmployee.city);
    if (targetEmployee.stateProvince) setStateProvince(targetEmployee.stateProvince);
    if (targetEmployee.postalCode) setPostalCode(targetEmployee.postalCode);
    if (targetEmployee.country) setCountry(targetEmployee.country);
    if (targetEmployee.emergencyContact?.name && targetEmployee.emergencyContact.name !== '—') {
      setEmergencyName(targetEmployee.emergencyContact.name);
    }
    if (targetEmployee.emergencyContact?.relation && targetEmployee.emergencyContact.relation !== '—') {
      setEmergencyRelation(targetEmployee.emergencyContact.relation);
    }
    if (targetEmployee.emergencyContact?.phone && targetEmployee.emergencyContact.phone !== '—') {
      setEmergencyPhone(targetEmployee.emergencyContact.phone);
    }
    if (targetEmployee.bankDetails?.bankName) setBankName(targetEmployee.bankDetails.bankName);
    if (targetEmployee.bankDetails?.accountNumber) setAccountNumber(targetEmployee.bankDetails.accountNumber);
    if (targetEmployee.bankDetails?.ifscCode) setIfscCode(targetEmployee.bankDetails.ifscCode);
    if (targetEmployee.bankDetails?.accountHolderName) {
      setAccountHolderName(targetEmployee.bankDetails.accountHolderName);
    }
    if (targetEmployee.personalTaxId) setPersonalTaxId(targetEmployee.personalTaxId);
    if (targetEmployee.socialInsurance) setSocialInsurance(targetEmployee.socialInsurance);
    if (targetEmployee.pfUanNumber) setPfUanNumber(targetEmployee.pfUanNumber);
    if (targetEmployee.esiNumber) setEsiNumber(targetEmployee.esiNumber);
    if (targetEmployee.customFieldValues) setCustomFieldValues(targetEmployee.customFieldValues);
  }, [targetEmployee]);

  const handleCountryChange = (nextCountry: string) => {
    setCountry(nextCountry);
    setStateProvince('');
    setCity('');
  };

  const handleStateChange = (nextState: string) => {
    setStateProvince(nextState);
    setCity('');
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStepError('Profile photo must be an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setAvatar(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (fieldId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    setUploadedFiles((prev) => ({
      ...prev,
      [fieldId]: {
        id: `doc_${Date.now()}`,
        name: file.name,
        size: `${sizeMb} MB`,
        type: file.type || 'application/pdf',
        uploadDate: new Date().toISOString().split('T')[0],
      },
    }));
  };

  const handleRemoveUploadedFile = (fieldId: string) => {
    setUploadedFiles((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const validateCustomSection = (section: OnboardingSectionKey): string | null => {
    for (const field of configuredFields.filter((f) => f.enabled && !f.isSystemDefault && f.section === section)) {
      if (!field.required) continue;
      const val = customFieldValues[field.id];
      if (val == null || String(val).trim() === '') {
        return `"${field.label}" is required`;
      }
    }
    return null;
  };

  const goNext = () => {
    setStepError('');

    if (currentStep === 'password') {
      if (!newPassword.trim() && !confirmPassword.trim()) {
        setStepIndex((i) => Math.min(i + 1, steps.length - 1));
        return;
      }
      const strength = evaluateCognitoPassword(newPassword);
      if (!strength.isValid) {
        setStepError(`Password must meet all security requirements. Missing: ${strength.missingRequirements.join(', ')}.`);
        return;
      }
      if (newPassword !== confirmPassword) {
        setStepError('New passwords do not match');
        return;
      }
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      return;
    }

    if (currentStep === 'personal') {
      const basicPersonal = configuredFields.filter(
        (f) =>
          f.enabled &&
          (f.section === 'basic' || f.section === 'personal') &&
          f.name !== 'designation' &&
          f.name !== 'department'
      );
      for (const field of basicPersonal) {
        if (!field.required) continue;
        if (field.name === 'name' && !fullName.trim()) {
          setStepError('Full legal name is required');
          return;
        }
        if (field.name === 'phone' && !phone.trim()) {
          setStepError('Contact phone number is required');
          return;
        }
        if (field.name === 'dateOfBirth') {
          if (!dateOfBirth.trim()) {
            setStepError('Date of birth is required');
            return;
          }
          if (dateOfBirth > new Date().toISOString().split('T')[0]) {
            setStepError('Date of birth cannot be in the future');
            return;
          }
        }
        if (field.name === 'gender' && !gender.trim()) {
          setStepError('Gender is required');
          return;
        }
        if (field.name === 'bloodGroup' && !bloodGroup.trim()) {
          setStepError('Blood group is required');
          return;
        }
        if (field.name === 'maritalStatus' && !maritalStatus.trim()) {
          setStepError('Marital status is required');
          return;
        }
        if (field.name === 'nationality' && !nationality.trim()) {
          setStepError('Nationality is required');
          return;
        }
        if (field.name === 'personalEmail' && !personalEmail.trim()) {
          setStepError('Personal backup email is required');
          return;
        }
        if (field.name === 'healthInsurance' && !healthInsurance.trim()) {
          setStepError('Health insurance is required');
          return;
        }
        if (field.name === 'bio' && !bio.trim()) {
          setStepError('Bio is required');
          return;
        }
        if (field.name === 'avatar' && !avatar.trim()) {
          setStepError('Profile photo is required');
          return;
        }
      }
      if (phone.trim() && phone.replace(/\D/g, '').length !== 10) {
        setStepError('Phone number must be exactly 10 digits');
        return;
      }
      if (personalEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail.trim())) {
        setStepError('Enter a valid personal backup email');
        return;
      }
      const customError = validateCustomSection('personal') || validateCustomSection('basic');
      if (customError) {
        setStepError(customError);
        return;
      }
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      return;
    }

    if (currentStep === 'address') {
      for (const field of configuredFields.filter((f) => f.enabled && f.section === 'address')) {
        if (!field.required) continue;
        if (field.name === 'primaryAddress' && !streetAddress.trim()) {
          setStepError('Residential street address is required');
          return;
        }
        if (field.name === 'city' && !city.trim()) {
          setStepError('City is required');
          return;
        }
        if (field.name === 'stateProvince' && !stateProvince.trim()) {
          setStepError('State / province is required');
          return;
        }
        if (field.name === 'postalCode' && !postalCode.trim()) {
          setStepError('Postal / ZIP code is required');
          return;
        }
        if (field.name === 'country' && !country.trim()) {
          setStepError('Country is required');
          return;
        }
        if (field.name === 'emergencyContactName' && !emergencyName.trim()) {
          setStepError('Emergency contact name is required');
          return;
        }
        if (field.name === 'emergencyContactRelation' && !emergencyRelation.trim()) {
          setStepError('Emergency contact relationship is required');
          return;
        }
        if (field.name === 'emergencyContactPhone' && !emergencyPhone.trim()) {
          setStepError('Emergency contact phone is required');
          return;
        }
      }
      if (
        postalCode.trim() &&
        !/^[A-Z0-9][A-Z0-9\s-]{1,9}$/i.test(postalCode.trim())
      ) {
        setStepError('Enter a valid postal / ZIP code (3–10 letters or digits)');
        return;
      }
      if (emergencyPhone.trim() && emergencyPhone.replace(/\D/g, '').length !== 10) {
        setStepError('Emergency phone must be exactly 10 digits');
        return;
      }
      const customError = validateCustomSection('address');
      if (customError) {
        setStepError(customError);
        return;
      }
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      return;
    }

    if (currentStep === 'banking') {
      for (const field of configuredFields.filter((f) => f.enabled && f.section === 'banking')) {
        if (!field.required) continue;
        if (field.name === 'bankName' && !bankName.trim()) {
          setStepError('Bank name is required');
          return;
        }
        if (field.name === 'accountNumber' && !accountNumber.trim()) {
          setStepError('Account number is required');
          return;
        }
        if (field.name === 'ifscCode' && !ifscCode.trim()) {
          setStepError('Routing / IFSC / SWIFT is required');
          return;
        }
        if (field.name === 'accountHolderName' && !accountHolderName.trim()) {
          setStepError('Account holder name is required');
          return;
        }
        if (field.name === 'personalTaxId' && !personalTaxId.trim()) {
          setStepError('PAN / tax ID is required');
          return;
        }
        if (field.name === 'socialInsurance' && !socialInsurance.trim()) {
          setStepError('Social insurance number is required');
          return;
        }
        if (field.name === 'pfUanNumber' && !pfUanNumber.trim()) {
          setStepError('PF UAN is required');
          return;
        }
        if (field.name === 'esiNumber' && !esiNumber.trim()) {
          setStepError('ESIC number is required');
          return;
        }
      }
      const customError = validateCustomSection('banking');
      if (customError) {
        setStepError(customError);
        return;
      }
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      return;
    }

    if (currentStep === 'documents') {
      for (const field of documentFields) {
        if (field.required && !uploadedFiles[field.id]) {
          setStepError(`Upload the required document: "${field.label}"`);
          return;
        }
      }
      setStepIndex((i) => Math.min(i + 1, steps.length - 1));
      return;
    }

    if (currentStep === 'review') {
      if (!agreedToDeclaration) {
        setStepError('Confirm the profile accuracy declaration');
        return;
      }
      void handleFinishOnboarding();
    }
  };

  const handleFinishOnboarding = async () => {
    if (!targetEmployee?.id || isSubmitting) {
      if (!targetEmployee?.id) {
        triggerToast({
          title: 'Profile not ready',
          message: 'Your employee record has not loaded yet. Refresh and try again.',
          type: 'error',
        });
      }
      return;
    }

    setIsSubmitting(true);
    const changedPassword = newPassword.trim() || undefined;
    const docsArray = Object.entries(uploadedFiles).map(([fieldId, file]) => {
      const fieldDef = configuredFields.find((f) => f.id === fieldId);
      return {
        id: file.id,
        fieldId,
        name: file.name,
        size: file.size,
        type: file.type,
        category: fieldDef?.label || 'General Document',
        uploadDate: file.uploadDate,
      };
    });

    const nameParts = fullName.trim().split(' ');
    const fName = nameParts[0] || fullName.trim();
    const lName = nameParts.slice(1).join(' ') || '';

    try {
      const hasBankAccountFields =
        fieldEnabled('bankName') ||
        fieldEnabled('accountNumber') ||
        fieldEnabled('ifscCode') ||
        fieldEnabled('accountHolderName');

      await api.identity.updateEmployee(targetEmployee.id, {
        firstName: fName,
        lastName: lName,
        password: changedPassword,
        isActivated: true,
        accountStatus: 'Active',
        hasCompletedProfile: true,
        onboardingProgress: 100,
        phone: phone.trim(),
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
        bloodGroup: bloodGroup || undefined,
        maritalStatus: maritalStatus || undefined,
        nationality: nationality || undefined,
        personalEmail: personalEmail.trim() || undefined,
        healthInsurance: healthInsurance.trim() || undefined,
        bio: bio.trim() || undefined,
        avatar: avatar || undefined,
        primaryAddress: streetAddress || undefined,
        city: city || undefined,
        stateProvince: stateProvince || undefined,
        postalCode: postalCode || undefined,
        country: country || undefined,
        personalTaxId: personalTaxId || undefined,
        panNumber: personalTaxId || undefined,
        socialInsurance: socialInsurance || undefined,
        pfUanNumber: pfUanNumber || undefined,
        esiNumber: esiNumber || undefined,
        emergencyContact: {
          name: emergencyName.trim(),
          relation: emergencyRelation.trim(),
          phone: emergencyPhone.trim(),
        },
        customFieldValues,
        uploadedDocuments: docsArray,
        employmentStatus: 'active',
      });

      if (hasBanking && hasBankAccountFields && (bankName.trim() || accountNumber.trim())) {
        await api.identity.updateBankDetails(targetEmployee.id, {
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          routingOrIfscCode: ifscCode.trim(),
          accountHolderName: accountHolderName.trim() || fullName.trim(),
        });
      }

      const updatedEmployees: Employee[] = (state.employees || []).map((emp) => {
        if (emp.id === targetEmployee.id || emp.employeeId === targetEmployee.employeeId) {
          return {
            ...emp,
            name: fullName.trim(),
            fullName: fullName.trim(),
            phone: phone.trim(),
            dateOfBirth: dateOfBirth || emp.dateOfBirth,
            gender: (gender as Employee['gender']) || emp.gender,
            bloodGroup: bloodGroup || emp.bloodGroup,
            maritalStatus: maritalStatus || emp.maritalStatus,
            nationality: nationality || emp.nationality,
            personalEmail: personalEmail.trim() || emp.personalEmail,
            healthInsurance: healthInsurance.trim() || emp.healthInsurance,
            bio: bio.trim() || emp.bio,
            avatar: avatar || emp.avatar,
            primaryAddress: streetAddress || emp.primaryAddress,
            city: city || emp.city,
            stateProvince: stateProvince || emp.stateProvince,
            postalCode: postalCode || emp.postalCode,
            country: country || emp.country,
            personalTaxId: personalTaxId || emp.personalTaxId,
            panNumber: personalTaxId || emp.panNumber,
            socialInsurance: socialInsurance || emp.socialInsurance,
            pfUanNumber: pfUanNumber || emp.pfUanNumber,
            esiNumber: esiNumber || emp.esiNumber,
            bankDetails:
              hasBanking && hasBankAccountFields && (bankName.trim() || accountNumber.trim())
                ? {
                    bankName: bankName.trim(),
                    accountNumber: accountNumber.trim(),
                    ifscCode: ifscCode.trim(),
                    accountHolderName: accountHolderName.trim(),
                  }
                : emp.bankDetails,
            customFieldValues: {
              ...(emp.customFieldValues || {}),
              ...customFieldValues,
            },
            uploadedDocuments: docsArray,
            isActivated: true,
            hasCompletedProfile: true,
            status: 'Active',
            accountStatus: 'Active',
            onboardingProgress: 100,
            emergencyContact: {
              name: emergencyName.trim() || emp.emergencyContact?.name || '',
              relation: emergencyRelation.trim() || emp.emergencyContact?.relation || '',
              phone: emergencyPhone.trim() || emp.emergencyContact?.phone || '',
            },
          };
        }
        return emp;
      });

      const updatedPersona: UserPersona = {
        id: targetEmployee.id,
        name: fullName.trim(),
        email: targetEmployee.email,
        role: (targetEmployee.role as UserPersona['role']) || 'employee',
        designation: targetEmployee.designation,
        department: targetEmployee.department,
        avatar: avatar || targetEmployee.avatar,
      };

      const nextAudit = [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
          user: fullName.trim(),
          action: 'EMPLOYEE_ONBOARDING_COMPLETED',
          entity: 'EmployeeProfile',
          entityId: targetEmployee.id,
          ipAddress: '106.51.72.18',
          details: `Profile and onboarding completed by ${fullName.trim()}${docsArray.length ? ` with ${docsArray.length} document(s)` : ''}.`,
        },
        ...(state.auditLogs || []),
      ];

      updateState((prev) => ({
        ...prev,
        employees: updatedEmployees,
        currentPersona: updatedPersona,
        auditLogs: nextAudit,
      }));
      selectPersona(updatedPersona);
      saveStoredState({
        ...state,
        employees: updatedEmployees,
        currentPersona: updatedPersona,
        auditLogs: nextAudit,
      });

      try {
        await syncWithBackend({
          ...state,
          employees: updatedEmployees,
          currentPersona: updatedPersona,
        } as typeof state);
      } catch (syncErr) {
        console.warn('[Onboarding] Post-complete sync note:', syncErr);
      }

      triggerToast({
        title: 'Onboarding complete',
        message: `Welcome to the workspace, ${fullName.trim()}.`,
        type: 'success',
      });

      onComplete?.();
    } catch (err: unknown) {
      console.error('[Onboarding] Backend sync error:', err);
      const message = err instanceof Error ? err.message : 'Your profile was not saved. Please try again.';
      triggerToast({
        title: 'Could not finish onboarding',
        message,
        type: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCustomFieldsForSection = (sec: OnboardingSectionKey) => {
    const customFields = configuredFields.filter(
      (f) =>
        f.enabled &&
        !f.isSystemDefault &&
        f.section === sec &&
        f.name !== 'designation' &&
        f.name !== 'department'
    );
    if (customFields.length === 0) return null;

    return (
      <div className="setup-fields" style={{ marginTop: 8, paddingTop: 20, borderTop: '1px solid #dce2e5' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 750, letterSpacing: '-.02em' }}>
          Additional information
        </h3>
        <div className="setup-form-grid" style={{ marginTop: 0 }}>
          {customFields.map((field) => (
            <label key={field.id} className={`setup-field ${field.type === 'textarea' ? 'is-wide' : ''}`}>
              {field.label}
              {field.required ? ' *' : ''}
              {field.type === 'select' ? (
                <select
                  className="setup-control"
                  value={String(customFieldValues[field.id] ?? '')}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                >
                  <option value="">Select…</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={String(customFieldValues[field.id] ?? '')}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                  placeholder={field.placeholder || 'Enter details…'}
                  className="setup-control"
                  style={{ height: 'auto', padding: '10px 14px', resize: 'vertical' }}
                />
              ) : (
                <input
                  className="setup-control"
                  type={
                    field.type === 'number'
                      ? 'number'
                      : field.type === 'date'
                        ? 'date'
                        : field.type === 'email'
                          ? 'email'
                          : field.type === 'tel'
                            ? 'tel'
                            : 'text'
                  }
                  value={String(customFieldValues[field.id] ?? '')}
                  onChange={(e) =>
                    setCustomFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))
                  }
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}…`}
                />
              )}
              {field.description ? (
                <span style={{ display: 'block', marginTop: 6, fontSize: 12, color: '#687789', fontWeight: 400 }}>
                  {field.description}
                </span>
              ) : null}
            </label>
          ))}
        </div>
      </div>
    );
  };

  const primaryLabel =
    isSubmitting
      ? 'Saving…'
      : currentStep === 'review'
        ? 'Complete onboarding'
        : 'Continue';

  if (!targetEmployee?.id) {
    return (
      <div className="pixbe-setup">
        <div className="pixbe-setup__content" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>Loading your employee profile…</p>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#5e6c7b' }}>
              If this does not resolve in a few seconds, refresh the page or sign in again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pixbe-setup employee-onboarding employee-onboarding-studio figma-employee">
      <header className="employee-onboarding-header"><PixbeWordmark/><OnboardingAccount compact/></header>
      <div className="pixbe-setup__main">
        <div className="pixbe-setup__content">
          <div className="pixbe-setup__form">
            <p className="employee-onboarding-eyebrow">{state.organization?.name || 'Your workspace'} / Profile setup</p>
            <div className="employee-onboarding-welcome"><h1>Welcome to the team{fullName ? `, ${fullName.split(' ')[0]}` : ''}</h1></div>
            <div className="onboarding-notice"><strong>{state.organization?.name || 'Workspace'}{targetEmployee.designation ? ` · ${targetEmployee.designation}` : ''}</strong><p>{targetEmployee.department || 'Your team'}{targetEmployee.officeName ? ` · ${targetEmployee.officeName}` : ''}. Complete the steps below to finish your profile.</p></div>
          <ol
            className="pixbe-setup__steps"
            style={{ ['--eo-steps' as string]: String(steps.length) }}
          >
            {steps.map((step, index) => {
              const isCurrent = index === stepIndex;
              const isDone = index < stepIndex;
              return (
                <li key={step.key}>
                  <button
                    type="button"
                    disabled={index >= stepIndex || isSubmitting}
                    onClick={() => { setStepError(''); setStepIndex(index); }}
                    className={isCurrent ? 'is-current' : isDone ? 'is-done' : undefined}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    <span className="pixbe-setup__step-no" aria-hidden="true">
                      {isDone ? '✓' : index + 1}
                    </span>
                    <span>
                      <strong>{step.label}</strong>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

            <div className="pixbe-setup__heading">
              <h2>{STEP_TITLES[currentStep]}</h2>
            </div>

            {stepError ? (
              <div className="pixbe-setup__message is-error" role="alert" style={{ marginTop: 20 }}>
                <span className="inline-flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
                  {stepError}
                </span>
              </div>
            ) : null}

            <div style={{ marginTop: 28 }}>
              {currentStep === 'password' && (
                <div className="setup-fields">
                  <label className="setup-field">
                    New password
                    <div className="setup-password">
                      <input
                        className="setup-control"
                        type={showNewPass ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Leave empty to keep your current password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="setup-icon-btn"
                        onClick={() => setShowNewPass((v) => !v)}
                        aria-label={showNewPass ? 'Hide password' : 'Show password'}
                      >
                        {showNewPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </label>
                  {newPassword.length > 0 ? <CognitoPasswordPolicyGuide password={newPassword} showAlways /> : null}
                  <label className="setup-field">
                    Confirm new password
                    <div className="setup-password">
                      <input
                        className="setup-control"
                        type={showConfirmPass ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="setup-icon-btn"
                        onClick={() => setShowConfirmPass((v) => !v)}
                        aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                  </label>
                </div>
              )}

              {currentStep === 'personal' && (
                <div className="setup-fields">
                  {fieldEnabled('avatar') && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 14,
                        marginBottom: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: '50%',
                          overflow: 'hidden',
                          border: '1px solid #dce2e5',
                          background: '#f3f5f7',
                          flexShrink: 0,
                        }}
                      >
                        <UserAvatar src={avatar} name={fullName || targetEmployee.name} className="h-full w-full"/>
                      </div>
                      <div className="employee-profile-photo-action"><button type="button" onClick={() => avatarInputRef.current?.click()}>Add profile photo{requiredMark(fieldRequired('avatar'))}</button><input ref={avatarInputRef} type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload}/><p>{fieldRequired('avatar') ? 'Required by your workspace.' : 'Optional. Add a photo your teammates will recognise.'}</p></div>
                    </div>
                  )}
                  <div className="setup-form-grid" style={{ marginTop: 0 }}>
                    {fieldEnabled('name') && (
                      <label className="setup-field">
                        Full legal name{requiredMark(fieldRequired('name'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g. Alex Mercer"
                        />
                      </label>
                    )}
                    {fieldEnabled('email') && (
                      <label className="setup-field">
                        Work email
                        <input className="setup-control" type="email" value={email} disabled />
                      </label>
                    )}
                    {fieldEnabled('phone') && (
                      <label className="setup-field">
                        Phone number{requiredMark(fieldRequired('phone'))}
                        <input
                          className="setup-control"
                          type="tel"
                          maxLength={10}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="e.g. 9876543210"
                        />
                      </label>
                    )}
                    {fieldEnabled('dateOfBirth') && (
                      <label className="setup-field">
                        Date of birth{requiredMark(fieldRequired('dateOfBirth'))}
                        <DateInput className="setup-control" max={new Date().toISOString().split('T')[0]} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)}
                        />
                      </label>
                    )}
                    {fieldEnabled('bloodGroup') && (
                      <label className="setup-field">
                        Blood group{requiredMark(fieldRequired('bloodGroup'))}
                        <select
                          className="setup-control"
                          value={bloodGroup}
                          onChange={(e) => setBloodGroup(e.target.value)}
                        >
                          <option value="">Select blood group</option>
                          {(
                            configuredFields.find((f) => f.name === 'bloodGroup')?.options || [
                              'A+',
                              'A-',
                              'B+',
                              'B-',
                              'O+',
                              'O-',
                              'AB+',
                              'AB-',
                            ]
                          ).map((bg) => (
                            <option key={bg} value={bg}>
                              {bg}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {fieldEnabled('maritalStatus') && (
                      <label className="setup-field">
                        Marital status{requiredMark(fieldRequired('maritalStatus'))}
                        <select
                          className="setup-control"
                          value={maritalStatus}
                          onChange={(e) => setMaritalStatus(e.target.value)}
                        >
                          <option value="">Select status</option>
                          {(
                            configuredFields.find((f) => f.name === 'maritalStatus')?.options || [
                              'Single',
                              'Married',
                              'Other',
                            ]
                          ).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {fieldEnabled('nationality') && (
                      <label className="setup-field">
                        Nationality{requiredMark(fieldRequired('nationality'))}
                        <select
                          className="setup-control"
                          value={nationality}
                          onChange={(e) => setNationality(e.target.value)}
                        >
                          <option value="">Select nationality</option>
                          {WORLD_NATIONALITIES.map((nat) => (
                            <option key={nat} value={nat}>
                              {nat}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {fieldEnabled('personalEmail') && (
                      <label className="setup-field">
                        Personal backup email{requiredMark(fieldRequired('personalEmail'))}
                        <input
                          className="setup-control"
                          type="email"
                          value={personalEmail}
                          onChange={(e) => setPersonalEmail(e.target.value)}
                          placeholder="e.g. personal@gmail.com"
                        />
                      </label>
                    )}
                    {fieldEnabled('healthInsurance') && (
                      <label className="setup-field">
                        Health insurance / provider{requiredMark(fieldRequired('healthInsurance'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={healthInsurance}
                          onChange={(e) => setHealthInsurance(e.target.value)}
                          placeholder="e.g. Company plan / provider name"
                        />
                      </label>
                    )}
                    {fieldEnabled('bio') && (
                      <label className="setup-field is-wide">
                        About / bio{requiredMark(fieldRequired('bio'))}
                        <textarea
                          className="setup-control"
                          rows={3}
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Short public about text"
                          style={{ height: 'auto', padding: '10px 14px', resize: 'vertical' }}
                        />
                      </label>
                    )}
                  </div>

                  {fieldEnabled('gender') && (
                    <div style={{ marginTop: 8 }}>
                      <span
                        style={{
                          display: 'block',
                          color: '#172234',
                          fontSize: 12,
                          fontWeight: 650,
                          marginBottom: 8,
                        }}
                      >
                        Gender{requiredMark(fieldRequired('gender'))}
                      </span>
                      <div className="setup-chips" style={{ marginTop: 0 }}>
                        {genderOptions.map((g) => (
                          <button
                            key={g}
                            type="button"
                            className={`setup-chip ${gender === g ? 'is-on' : ''}`}
                            onClick={() => setGender(g)}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {renderCustomFieldsForSection('personal')}
                  {renderCustomFieldsForSection('basic')}
                </div>
              )}

              {currentStep === 'address' && (
                <div className="setup-fields">
                  <div className="setup-form-grid" style={{ marginTop: 0 }}>
                    {fieldEnabled('primaryAddress') && (
                      <label className="setup-field is-wide">
                        Street address{requiredMark(fieldRequired('primaryAddress'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={streetAddress}
                          onChange={(e) => setStreetAddress(e.target.value)}
                          placeholder="e.g. 42 Park Avenue, Apartment 5B"
                        />
                      </label>
                    )}
                    {fieldEnabled('country') && (
                      <label className="setup-field">
                        Country{requiredMark(fieldRequired('country'))}
                        <select
                          className="setup-control"
                          value={country}
                          onChange={(e) => handleCountryChange(e.target.value)}
                        >
                          <option value="">Select country</option>
                          {WORLD_COUNTRIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {fieldEnabled('stateProvince') && (
                      <label className="setup-field">
                        State / province{requiredMark(fieldRequired('stateProvince'))}
                        {useLocationSelects ? (
                          <select
                            className="setup-control"
                            value={stateProvince}
                            onChange={(e) => handleStateChange(e.target.value)}
                            disabled={!country}
                          >
                            <option value="">Select state / province</option>
                            {stateOptions.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="setup-control"
                            type="text"
                            value={stateProvince}
                            onChange={(e) => setStateProvince(e.target.value)}
                            placeholder="e.g. Karnataka"
                          />
                        )}
                      </label>
                    )}
                    {fieldEnabled('city') && (
                      <label className="setup-field">
                        City{requiredMark(fieldRequired('city'))}
                        {useLocationSelects ? (
                          <select
                            className="setup-control"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            disabled={!stateProvince}
                          >
                            <option value="">Select city</option>
                            {cityOptions.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="setup-control"
                            type="text"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="e.g. Bengaluru"
                          />
                        )}
                      </label>
                    )}
                    {fieldEnabled('postalCode') && (
                      <label className="setup-field">
                        Postal / ZIP code{requiredMark(fieldRequired('postalCode'))}
                        <input
                          className="setup-control"
                          type="text"
                          maxLength={10}
                          value={postalCode}
                          onChange={(e) =>
                            setPostalCode(
                              e.target.value.toUpperCase().replace(/[^A-Z0-9\s-]/g, '').slice(0, 10)
                            )
                          }
                          placeholder="e.g. 560001"
                        />
                      </label>
                    )}
                  </div>

                  <h3
                    style={{
                      margin: '12px 0 0',
                      paddingTop: 20,
                      borderTop: '1px solid #dce2e5',
                      fontSize: 15,
                      fontWeight: 750,
                      letterSpacing: '-.02em',
                    }}
                  >
                    Emergency contact
                  </h3>
                  <div className="setup-form-grid">
                    {fieldEnabled('emergencyContactName') && (
                      <label className="setup-field">
                        Contact name{requiredMark(fieldRequired('emergencyContactName'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={emergencyName}
                          onChange={(e) => setEmergencyName(e.target.value)}
                          placeholder="e.g. Sarah Mercer"
                        />
                      </label>
                    )}
                    {fieldEnabled('emergencyContactRelation') && (
                      <label className="setup-field">
                        Relationship{requiredMark(fieldRequired('emergencyContactRelation'))}
                        <select
                          className="setup-control"
                          value={emergencyRelation}
                          onChange={(e) => setEmergencyRelation(e.target.value)}
                        >
                          <option value="">Select relationship</option>
                          {(
                            configuredFields.find((f) => f.name === 'emergencyContactRelation')
                              ?.options || ['Spouse', 'Parent', 'Sibling', 'Family', 'Friend', 'Guardian']
                          ).map((rel) => (
                            <option key={rel} value={rel}>
                              {rel}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {fieldEnabled('emergencyContactPhone') && (
                      <label className="setup-field is-wide">
                        Emergency phone{requiredMark(fieldRequired('emergencyContactPhone'))}
                        <input
                          className="setup-control"
                          type="tel"
                          maxLength={10}
                          value={emergencyPhone}
                          onChange={(e) =>
                            setEmergencyPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                          }
                          placeholder="e.g. 9876543210"
                        />
                      </label>
                    )}
                  </div>
                  {renderCustomFieldsForSection('address')}
                </div>
              )}

              {currentStep === 'banking' && (
                <div className="setup-fields">
                  <div className="setup-form-grid" style={{ marginTop: 0 }}>
                    {fieldEnabled('bankName') && (
                      <label className="setup-field">
                        Bank{requiredMark(fieldRequired('bankName'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={bankName}
                          onChange={(e) => setBankName(e.target.value)}
                          placeholder="e.g. HDFC Bank"
                        />
                      </label>
                    )}
                    {fieldEnabled('accountHolderName') && (
                      <label className="setup-field">
                        Account holder name{requiredMark(fieldRequired('accountHolderName'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={accountHolderName}
                          onChange={(e) => setAccountHolderName(e.target.value)}
                          placeholder="As registered with the bank"
                        />
                      </label>
                    )}
                    {fieldEnabled('accountNumber') && (
                      <label className="setup-field">
                        Account number{requiredMark(fieldRequired('accountNumber'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                          placeholder="000123456789"
                        />
                      </label>
                    )}
                    {fieldEnabled('ifscCode') && (
                      <label className="setup-field">
                        Routing / IFSC / SWIFT{requiredMark(fieldRequired('ifscCode'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={ifscCode}
                          onChange={(e) => setIfscCode(e.target.value)}
                          placeholder="e.g. HDFC0001234"
                        />
                      </label>
                    )}
                    {fieldEnabled('personalTaxId') && (
                      <label className="setup-field">
                        PAN / SSN / tax ID{requiredMark(fieldRequired('personalTaxId'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={personalTaxId}
                          onChange={(e) => setPersonalTaxId(e.target.value)}
                          placeholder="ABCDE1234F"
                        />
                      </label>
                    )}
                    {fieldEnabled('socialInsurance') && (
                      <label className="setup-field">
                        Social insurance number{requiredMark(fieldRequired('socialInsurance'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={socialInsurance}
                          onChange={(e) => setSocialInsurance(e.target.value)}
                          placeholder="e.g. national social insurance ID"
                        />
                      </label>
                    )}
                    {fieldEnabled('pfUanNumber') && (
                      <label className="setup-field">
                        PF Universal Account (UAN){requiredMark(fieldRequired('pfUanNumber'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={pfUanNumber}
                          onChange={(e) => setPfUanNumber(e.target.value)}
                          placeholder="100987654321"
                        />
                      </label>
                    )}
                    {fieldEnabled('esiNumber') && (
                      <label className="setup-field">
                        ESIC insurance number{requiredMark(fieldRequired('esiNumber'))}
                        <input
                          className="setup-control"
                          type="text"
                          value={esiNumber}
                          onChange={(e) => setEsiNumber(e.target.value)}
                          placeholder="e.g. 1234567890"
                        />
                      </label>
                    )}
                  </div>
                  {renderCustomFieldsForSection('banking')}
                </div>
              )}

              {currentStep === 'documents' && (
                <div className="setup-fields">
                  {documentFields.map((field) => {
                    const uploaded = uploadedFiles[field.id];
                    return (
                      <div
                        key={field.id}
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 14,
                          padding: '16px 18px',
                          border: '1px solid #dce2e5',
                          borderRadius: 12,
                          background: '#fff',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                          <div style={{ fontSize: 14, fontWeight: 750, color: '#172234' }}>
                            {field.label}
                            {field.required ? ' *' : ''}
                          </div>
                          {field.description ? (
                            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#687789', lineHeight: 1.45 }}>
                              {field.description}
                            </p>
                          ) : null}
                        </div>
                        <div style={{ flex: '0 0 auto' }}>
                          {uploaded ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  minHeight: 36,
                                  padding: '0 12px',
                                  borderRadius: 7,
                                  border: '1px solid #dde4e9',
                                  background: '#eaf1ee',
                                  color: '#17324e',
                                  fontSize: 12,
                                  fontWeight: 650,
                                }}
                              >
                                <Check className="size-3.5" aria-hidden="true" />
                                <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {uploaded.name}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="setup-button setup-button--secondary"
                                style={{ minHeight: 36, padding: '0 10px' }}
                                onClick={() => handleRemoveUploadedFile(field.id)}
                                aria-label={`Remove ${field.label}`}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          ) : (
                            <label className="setup-button setup-button--primary" style={{ cursor: 'pointer' }}>
                              <UploadCloud className="size-4" aria-hidden="true" />
                              Select file
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                                onChange={(e) => handleFileUpload(field.id, e)}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {currentStep === 'review' && (
                <div className="setup-fields">
                  <div className="setup-review-list" style={{ marginTop: 0 }}>
                    <div className="setup-review-item" style={{ gridTemplateColumns: '1fr' }}>
                      <div>
                        <h3>Personal</h3>
                        <div className="setup-facts-detail">
                          {fieldEnabled('name') && (
                            <p>
                              <strong>Name:</strong> {fullName || '—'}
                            </p>
                          )}
                          {fieldEnabled('email') && (
                            <p>
                              <strong>Work email:</strong> {email || '—'}
                            </p>
                          )}
                          {fieldEnabled('phone') && phone && (
                            <p>
                              <strong>Phone:</strong> {phone}
                            </p>
                          )}
                          {fieldEnabled('dateOfBirth') && dateOfBirth && (
                            <p>
                              <strong>Date of birth:</strong> {dateOfBirth}
                            </p>
                          )}
                          {fieldEnabled('gender') && gender && (
                            <p>
                              <strong>Gender:</strong> {gender}
                            </p>
                          )}
                          {fieldEnabled('bloodGroup') && bloodGroup && (
                            <p>
                              <strong>Blood group:</strong> {bloodGroup}
                            </p>
                          )}
                          {fieldEnabled('maritalStatus') && maritalStatus && (
                            <p>
                              <strong>Marital status:</strong> {maritalStatus}
                            </p>
                          )}
                          {fieldEnabled('nationality') && nationality && (
                            <p>
                              <strong>Nationality:</strong> {nationality}
                            </p>
                          )}
                          {fieldEnabled('personalEmail') && personalEmail && (
                            <p>
                              <strong>Personal email:</strong> {personalEmail}
                            </p>
                          )}
                          {fieldEnabled('healthInsurance') && healthInsurance && (
                            <p>
                              <strong>Health insurance:</strong> {healthInsurance}
                            </p>
                          )}
                          {fieldEnabled('bio') && bio && (
                            <p>
                              <strong>Bio:</strong> {bio}
                            </p>
                          )}
                          {fieldEnabled('avatar') && (
                            <p>
                              <strong>Profile photo:</strong> {avatar ? 'Uploaded' : 'Not uploaded'}
                            </p>
                          )}
                          {(targetEmployee.designation || targetEmployee.department) && (
                            <p>
                              <strong>Role / department:</strong>{' '}
                              {[targetEmployee.designation, targetEmployee.department]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="setup-review-item" style={{ gridTemplateColumns: '1fr' }}>
                      <div>
                        <h3>Address & emergency</h3>
                        <div className="setup-facts-detail">
                          <p>
                            {[streetAddress, city, stateProvince, postalCode, country]
                              .filter(Boolean)
                              .join(', ') || '—'}
                          </p>
                          {(emergencyName || emergencyPhone) && (
                            <p>
                              <strong>Emergency:</strong> {emergencyName || '—'}
                              {emergencyRelation ? ` (${emergencyRelation})` : ''}
                              {emergencyPhone ? ` · ${emergencyPhone}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {hasBanking && (
                      <div className="setup-review-item" style={{ gridTemplateColumns: '1fr' }}>
                        <div>
                          <h3>Banking & tax</h3>
                          <div className="setup-facts-detail">
                            {fieldEnabled('bankName') && bankName && (
                              <p>
                                <strong>Bank:</strong> {bankName}
                                {accountNumber ? ` · ···${accountNumber.slice(-4)}` : ''}
                              </p>
                            )}
                            {fieldEnabled('accountHolderName') && accountHolderName && (
                              <p>
                                <strong>Account holder:</strong> {accountHolderName}
                              </p>
                            )}
                            {fieldEnabled('personalTaxId') && personalTaxId && (
                              <p>
                                <strong>Tax ID:</strong> {personalTaxId}
                              </p>
                            )}
                            {fieldEnabled('socialInsurance') && socialInsurance && (
                              <p>
                                <strong>Social insurance:</strong> {socialInsurance}
                              </p>
                            )}
                            {fieldEnabled('pfUanNumber') && pfUanNumber && (
                              <p>
                                <strong>PF UAN:</strong> {pfUanNumber}
                              </p>
                            )}
                            {fieldEnabled('esiNumber') && esiNumber && (
                              <p>
                                <strong>ESIC:</strong> {esiNumber}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    {hasDocuments && (
                      <div className="setup-review-item" style={{ gridTemplateColumns: '1fr' }}>
                        <div>
                          <h3>Documents</h3>
                          {Object.keys(uploadedFiles).length === 0 ? (
                            <p>No documents attached</p>
                          ) : (
                            <div className="setup-facts-detail">
                              {Object.entries(uploadedFiles).map(([fieldId, file]) => {
                                const f = configuredFields.find((x) => x.id === fieldId);
                                return (
                                  <p key={fieldId}>
                                    <strong>{f?.label || 'Document'}:</strong> {file.name}
                                  </p>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <label
                    className="setup-check"
                    style={{
                      marginTop: 8,
                      alignItems: 'flex-start',
                      padding: '16px 18px',
                      border: '1px solid #dce2e5',
                      borderRadius: 12,
                      background: '#fff',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={agreedToDeclaration}
                      onChange={(e) => setAgreedToDeclaration(e.target.checked)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <strong style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
                        Profile accuracy confirmation
                      </strong>
                      <span style={{ fontSize: 13, color: '#5e6c7b', fontWeight: 400, lineHeight: 1.45 }}>
                        I confirm that the details I submitted are accurate and up to date.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div className="setup-form-actions" style={{ marginTop: 32 }}>
              {stepIndex > 0 ? (
                <button
                  type="button"
                  className="setup-button setup-button--secondary"
                  onClick={() => {
                    setStepError('');
                    setStepIndex((i) => Math.max(0, i - 1));
                  }}
                >
                  Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                className="setup-button setup-button--primary"
                disabled={isSubmitting}
                onClick={goNext}
              >
                {primaryLabel}
                {!isSubmitting && currentStep !== 'review' ? <span aria-hidden="true">→</span> : null}
              </button>
            </div>
          </div>
          <footer className="employee-onboarding-footer"><span>Your administrator manages your workspace access.</span><OnboardingHelp/></footer>
        </div>
      </div>

    </div>
  );
};
