'use client';

import React from 'react';
import Link from 'next/link';
import { useMobileViewport } from '@/hooks/useMobileViewport';

export type WorkdayStatusKind = 'idle' | 'live' | 'break' | 'done';

const RING_SIZE = 176;
const RING_STROKE = 5.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function formatWorkdayClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return { hours: pad2(h), minutes: pad2(m), seconds: pad2(s) };
}

export function formatWorkdayTarget(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  return `${pad2(h)}h ${pad2(m)}m`;
}

const STATUS_COPY: Record<WorkdayStatusKind, string> = {
  idle: 'Not punched in',
  live: 'Clocked in',
  break: 'On break',
  done: 'Clocked out',
};

function WorkdayStatus({ kind, label }: { kind: WorkdayStatusKind; label: string }) {
  return (
    <span className={`workday-chip is-${kind}`}>
      {label}
    </span>
  );
}

interface WorkdayClockCardProps {
  compact?: boolean;
  statusKind: WorkdayStatusKind;
  statusLabel?: string;
  elapsedSeconds: number;
  targetSeconds: number;
  shiftName: string;
  shiftHours: string;
  locationSelect?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  primaryAction?: React.ReactNode;
}

export function WorkdayClockCard({
  compact = false,
  statusKind,
  statusLabel,
  elapsedSeconds,
  targetSeconds,
  shiftName,
  shiftHours,
  locationSelect,
  secondaryAction,
  primaryAction,
}: WorkdayClockCardProps) {
  const mobile = useMobileViewport();
  const safeTarget = Math.max(1, targetSeconds);
  const progress = Math.max(0, Math.min(100, (elapsedSeconds / safeTarget) * 100));
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress / 100);
  const clock = formatWorkdayClock(elapsedSeconds);
  const targetLabel = formatWorkdayTarget(targetSeconds);
  const live = statusKind === 'live' || statusKind === 'break';
  const chip = statusLabel || STATUS_COPY[statusKind];
  const hasActions = Boolean(locationSelect || secondaryAction || primaryAction);

  if (mobile) {
    return <section className={'m2-workday' + (compact ? ' m2-workday--home' : '')} aria-label={compact ? "Today's shift" : 'My workday'}>
      <p className={'m2-workday-status is-' + statusKind}>{compact && statusKind === 'idle' ? 'Today’s shift' : chip}</p>
      {compact && statusKind === 'idle' ? <strong className="m2-workday-hours">{shiftHours.replace(' - ', ' – ')}</strong> : <strong className="m2-workday-clock" suppressHydrationWarning>{clock.hours}:{clock.minutes}:{clock.seconds}</strong>}
      <p className="m2-workday-shift">{shiftName}{!(compact && statusKind === 'idle') && ' · ' + shiftHours}</p>
      {locationSelect && <div className="m2-workday-location">{locationSelect}</div>}
      {hasActions && <div className="m2-workday-actions">{primaryAction}{secondaryAction}</div>}
    </section>;
  }

  if (compact) {
    return (
      <section className="dash-workday-card" aria-label="Today's time">
        <header className="dash-workday-heading">
          <h2>Today's time</h2>
          <Link href="/timesheets" className="dash-quiet-link">Timesheet ↗</Link>
        </header>
        <div className="dash-workday-time">
          <span className="dash-workday-elapsed" suppressHydrationWarning>{clock.hours}:{clock.minutes}</span>
          <WorkdayStatus kind={statusKind} label={chip} />
        </div>
        <p className="dash-workday-shift">{shiftHours}, {shiftName}</p>
        {locationSelect && <div className="dash-workday-location">{locationSelect}</div>}
        {hasActions && <div className="dash-workday-buttons">{secondaryAction}{primaryAction}</div>}
      </section>
    );
  }

  return (
    <section className={`workday-card is-${statusKind}`} aria-label="My workday">
      <header className="workday-card-head">
        <h2 className="workday-card-title">My workday</h2>
        <WorkdayStatus kind={statusKind} label={chip} />
      </header>

      <div className="workday-ring-wrap">
        <svg
          className="workday-ring"
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Hours logged toward today’s shift"
        >
          <circle
            className="workday-ring-track"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
          />
          <circle
            className="workday-ring-fill"
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </svg>
        <div className="workday-ring-copy">
          <p
            className="workday-elapsed"
            suppressHydrationWarning
            aria-live={live ? 'polite' : undefined}
            aria-atomic="true"
          >
            <span className="workday-elapsed-hms">
              {clock.hours}
              <span className="workday-elapsed-sep">:</span>
              {clock.minutes}
            </span>
            <span className="workday-elapsed-sec">:{clock.seconds}</span>
          </p>
          <p className="workday-elapsed-hint">of {targetLabel} today</p>
        </div>
      </div>

      <div className="workday-shift">
        <span className="workday-shift-name">{shiftName}</span>
        <span className="workday-shift-hours">{shiftHours}</span>
      </div>

      {hasActions ? (
        <div className="workday-actions">
          {locationSelect ? <div className="workday-location">{locationSelect}</div> : null}
          <div className="workday-buttons">
            {secondaryAction}
            {primaryAction}
          </div>
        </div>
      ) : null}
    </section>
  );
}
