'use client';

import React from 'react';

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

interface WorkdayClockCardProps {
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
  const safeTarget = Math.max(1, targetSeconds);
  const progress = Math.max(0, Math.min(100, (elapsedSeconds / safeTarget) * 100));
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress / 100);
  const clock = formatWorkdayClock(elapsedSeconds);
  const targetLabel = formatWorkdayTarget(targetSeconds);
  const live = statusKind === 'live' || statusKind === 'break';
  const chip = statusLabel || STATUS_COPY[statusKind];
  const hasActions = Boolean(locationSelect || secondaryAction || primaryAction);

  return (
    <section className={`workday-card is-${statusKind}`} aria-label="My workday">
      <header className="workday-card-head">
        <h2 className="workday-card-title">My workday</h2>
        <span className={`workday-chip is-${statusKind}`}>{chip}</span>
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
