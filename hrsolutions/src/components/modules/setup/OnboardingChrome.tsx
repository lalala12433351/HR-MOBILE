'use client';

import React, { useState } from 'react';
import { X, CircleHelp } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function OnboardingHelp({ label = 'Need help?' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="onboarding-help-link" onClick={() => setOpen(true)}>{label}</button>{open && <div className="onboarding-help-overlay" role="presentation" onClick={() => setOpen(false)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="onboarding-help-title" className="onboarding-help-dialog" tabIndex={-1} ref={(node) => node?.focus()} onClick={(event) => event.stopPropagation()}><header><CircleHelp size={20}/><h2 id="onboarding-help-title">Help with setup</h2><button type="button" aria-label="Close setup help" onClick={() => setOpen(false)}><X size={18}/></button></header><p>Complete the required fields in each step, then choose Continue. Use Back or a completed step to review your details.</p><p>For an invitation, missing employee details, or access questions, contact your workspace administrator. If a save fails, your current form stays open so you can correct it and retry.</p><button type="button" className="setup-button setup-button--primary" onClick={() => setOpen(false)}>Back to setup</button></section></div>}</>;
}

export function OnboardingContextBar({ label = 'Workspace setup' }: { label?: string }) {
  return <div className="onboarding-context"><span>{label}</span><OnboardingHelp/></div>;
}

export function OnboardingAccount({ compact = false, name, email }: { compact?: boolean; name?: string; email?: string }) {
  const { state, logout } = useApp();
  return <div className={`onboarding-account${compact ? ' is-compact' : ''}`}>{!compact && <strong>{name || state.currentPersona?.name || 'Your account'}</strong>}<span>{email || state.currentPersona?.email || ''}</span><button type="button" onClick={logout}>Sign out</button></div>;
}

export function OnboardingPageFooter({ current, total, saved = false }: { current: number; total: number; saved?: boolean }) {
  return <footer className="onboarding-page-footer"><span>{saved ? 'Your progress is saved as you go.' : 'Review your details before continuing.'}</span><span>{String(current).padStart(2,'0')} / {String(total).padStart(2,'0')}</span></footer>;
}
