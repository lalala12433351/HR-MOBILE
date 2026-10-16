'use client';

import React, { useEffect, useState } from 'react';
import { AppState } from '@/services/store';
import { api } from '@/services/apiClient';
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

  useEffect(() => {
    let cancelled = false;
    api.license
      .current()
      .then((res) => {
        if (cancelled || !res.data) return;
        onUpdateState((prev) => ({ ...prev, license: res.data as LicenseSummary }));
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'License details could not be loaded.');
      });
    api.license
      .events()
      .then((res) => {
        if (cancelled) return;
        setEvents(Array.isArray(res.data) ? (res.data as LicenseEvent[]) : []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [onUpdateState]);

  const license = (state.license || null) as LicenseSummary | null;

  return (
    <div className="settings-page">
      <section className="settings-page__card">
        <h2 className="settings-page__section-heading">{license?.planName || 'Workspace license'}</h2>
        {error && <p className="settings-page__hint">{error}</p>}
        {license ? (
          <dl className="settings-license-facts">
            <div>
              <dt>Status</dt>
              <dd>{statusLabel(license.status)}</dd>
            </div>
            <div>
              <dt>Billing</dt>
              <dd className="capitalize">{license.billingCycle}</dd>
            </div>
            <div>
              <dt>Seats</dt>
              <dd>
                {license.seatsUsed} / {license.maxSeats}
              </dd>
            </div>
            <div>
              <dt>Period</dt>
              <dd>
                {formatDate(license.periodStart)} – {formatDate(license.periodEnd)}
              </dd>
            </div>
            {license.trialEndsAt && (
              <div>
                <dt>Trial ends</dt>
                <dd>{formatDate(license.trialEndsAt)}</dd>
              </div>
            )}
            {(license.status === 'expiring' || license.status === 'trialing') && (
              <div>
                <dt>Days left</dt>
                <dd>{Math.max(0, license.daysRemaining)}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="settings-page__hint">Loading license…</p>
        )}
        {license?.features?.length ? (
          <ul className="settings-license-features">
            {license.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        ) : null}
        <p className="settings-page__hint">
          Plan changes and extra seats are handled by Pixbe. Use Help & support if you need an extension.
        </p>
      </section>

      <section className="settings-page__card">
        <h2 className="settings-page__section-heading">History</h2>
        {events.length === 0 ? (
          <p className="settings-page__hint">No license events yet.</p>
        ) : (
          <ol className="settings-license-history">
            {events.map((event) => (
              <li key={event.id}>
                <span className="capitalize">{actionLabel(event.action)}</span>
                {event.toPlan ? ` · ${event.toPlan}` : ''}
                {event.createdAt ? ` · ${formatDate(event.createdAt)}` : ''}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
