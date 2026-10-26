'use client';

import React, { useEffect, useState } from 'react';
import { AppState } from '@/services/store';
import { api } from '@/services/apiClient';
import { Check, Info, RefreshCw } from 'lucide-react';
import { SettingsPageHeader, SettingsButton, SettingsCard } from './settings/SettingsPrimitives';
import type { LicenseEvent, LicenseSummary } from '@/types';

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusLabel(status?: string): string {
  if (status === 'trialing') return 'Trial';
  if (status === 'expiring') return 'Ending soon';
  if (status === 'expired') return 'Expired';
  if (status === 'canceled') return 'Revoked';
  return 'Active';
}

function actionLabel(action: string): string {
  return action.replace(/_/g, ' ');
}

export function LicenseSettingsView({
  state,
  onUpdateState,
}: {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
}) {
  const [events, setEvents] = useState<LicenseEvent[]>([]);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setHistoryLoading(true); setError(''); setHistoryError('');
    api.license
      .current()
      .then((res) => {
        if (cancelled || !res.data) return;
        onUpdateState((prev) => ({ ...prev, license: res.data as LicenseSummary }));
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'License details could not be loaded.');
      }).finally(() => { if (!cancelled) setLoading(false); });
    api.license
      .events()
      .then((res) => {
        if (cancelled) return;
        setEvents(Array.isArray(res.data) ? (res.data as LicenseEvent[]) : []);
      })
      .catch(() => { if (!cancelled) setHistoryError('License history could not be loaded.'); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [onUpdateState, reload]);

  const license = (state.license || null) as LicenseSummary | null;

  return (
    <div className="settings-page">
      <SettingsPageHeader title="License" actions={<SettingsButton variant="secondary" loading={loading || historyLoading} onClick={() => setReload((value) => value + 1)}><RefreshCw size={15} aria-hidden="true" />Refresh</SettingsButton>} />
      {error && <p className="settings-inline-error" role="alert">{error}</p>}
      <div className="settings-license-overview">
        <SettingsCard>
          <div className="settings-license-plan"><h3>{license?.planName || 'Workspace license'}</h3>{license && <span className="settings-license-status" data-status={license.status}>{statusLabel(license.status)}</span>}</div>
          {license ? <dl className="settings-license-facts">
            <div><dt>Billing cycle</dt><dd className="capitalize">{license.billingCycle}</dd></div>
            <div><dt>Current period</dt><dd>{formatDate(license.periodStart)} – {formatDate(license.periodEnd)}</dd></div>
            {license.trialEndsAt && <div><dt>Trial ends</dt><dd>{formatDate(license.trialEndsAt)}</dd></div>}
            {(license.status === 'expiring' || license.status === 'trialing') && <div><dt>Days remaining</dt><dd>{Math.max(0, license.daysRemaining)}</dd></div>}
          </dl> : <p className="settings-page__hint">{loading ? 'Loading license…' : 'License details are unavailable. Use Refresh to try again.'}</p>}
        </SettingsCard>
        <SettingsCard title="Workspace seats" className="settings-license-seats">
          {license ? <><div className="settings-license-seat-count"><strong>{license.seatsUsed}</strong><span>of {license.maxSeats} seats used</span></div><progress aria-label="Seats used" max={Math.max(1, license.maxSeats)} value={license.seatsUsed} /><p className="settings-page__hint">{Math.max(0, license.maxSeats - license.seatsUsed)} seats available</p></> : <p className="settings-page__hint">Seat usage appears when the license is loaded.</p>}
        </SettingsCard>
      </div>
      {license?.features?.length ? <SettingsCard title="Included in your plan"><ul className="settings-license-features">{license.features.map((feature) => <li key={feature}><Check size={15} aria-hidden="true" />{feature}</li>)}</ul></SettingsCard> : null}
      <div className="settings-license-help"><Info size={16} aria-hidden="true" /><p>Plan changes and extra seats are handled by Pixbe. Use Help & support if you need an extension.</p></div>
      <SettingsCard title="License history">
        {historyError ? <p className="settings-inline-error" role="alert">{historyError}</p> : historyLoading ? <p className="settings-page__hint">Loading history…</p> : !events.length ? <p className="settings-page__hint">No license events yet.</p> : <ol className="settings-license-history">{events.map((event) => <li key={event.id}><div><span className="capitalize">{actionLabel(event.action)}</span>{event.toPlan && <small>{event.toPlan}</small>}</div>{event.createdAt && <time dateTime={event.createdAt}>{formatDate(event.createdAt)}</time>}</li>)}</ol>}
      </SettingsCard>
    </div>
  );
}
