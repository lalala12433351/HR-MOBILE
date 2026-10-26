'use client';

import React, { useId } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { SettingsToggle } from './SettingsToggle';
import { ResponsiveTable } from '@/components/common/ResponsiveTable';

export function SettingsPageHeader({ title, actions }: { title: React.ReactNode; actions?: React.ReactNode }) {
  return <header className="settings-page__header"><h2 className="settings-page__heading">{title}</h2>{actions && <div className="settings-page__actions">{actions}</div>}</header>;
}

export function SettingsButton({ children, loading = false, variant = 'primary', disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: 'primary' | 'secondary' }) {
  return <button {...props} type={props.type || 'button'} disabled={disabled || loading} aria-busy={loading || undefined} className={`settings-page__action${variant === 'secondary' ? '--secondary' : ''} ${props.className || ''}`}>
    {loading && <Loader2 size={15} className="settings-spinner" aria-hidden="true" />}{children}
  </button>;
}

export function SettingsCard({ title, description, actions, children, className = '', ...props }: React.HTMLAttributes<HTMLElement> & { title?: string; description?: string; actions?: React.ReactNode }) {
  return <section {...props} className={`settings-page__card ${className}`}>
    {(title || actions) && <header className="settings-card__header"><div>{title && <h3>{title}</h3>}{description && <p>{description}</p>}</div>{actions}</header>}{React.Children.map(children, (child) => React.isValidElement(child) && (child.type === 'table' || child.type === ResponsiveTable) ? <div className="settings-table-scroll">{child}</div> : child)}
  </section>;
}

export function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="settings-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function SettingsSwitchRow({ title, description, checked, onChange, disabled = false, labelledBy, className = '' }: { title: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; labelledBy?: string; className?: string }) {
  const generatedId = useId();
  const id = labelledBy || generatedId;
  return <div className={`settings-switch-row ${className}`}><div><label id={id}>{title}</label>{description && <p>{description}</p>}</div><SettingsToggle disabled={disabled} checked={checked} onChange={onChange} labelledBy={id} /></div>;
}

export function SettingsDayPicker({ value, onToggle }: { value: string[]; onToggle: (day: string) => void }) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return <fieldset className="settings-day-picker"><legend>Working days</legend><div>{days.map((day) => <button key={day} type="button" aria-label={day} aria-pressed={value.includes(day)} onClick={() => onToggle(day)}>{value.includes(day) && <Check size={12} aria-hidden="true" />}{day.slice(0, 3)}</button>)}</div></fieldset>;
}

export function SettingsLoading() {
  return <div className="settings-studio settings-loading" role="status" aria-label="Loading workspace settings" aria-busy="true">
    <span className="sr-only">Loading workspace settings…</span>
    <div className="settings-loading__title" aria-hidden="true" />
    <div className="settings-loading__tabs" aria-hidden="true">{[0,1,2,3,4].map((item) => <span key={item} />)}</div>
    <div className="settings-studio__layout" aria-hidden="true">
      <div className="settings-loading__nav">{[0,1,2,3,4,5].map((item) => <span key={item} />)}</div>
      <div className="settings-loading__content"><div className="settings-loading__title" />{[0,1].map((item) => <div className="settings-loading__card" key={item}><span /><div>{[0,1,2,3].map((field) => <span key={field} />)}</div></div>)}</div>
    </div>
  </div>;
}
