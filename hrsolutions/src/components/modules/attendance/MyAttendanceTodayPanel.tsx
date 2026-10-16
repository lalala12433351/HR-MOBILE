'use client';

import React from 'react';
import { WorkdayClockCard, WorkdayStatusKind } from '@/components/attendance/WorkdayClockCard';

export type TodayPunchStatus = WorkdayStatusKind;

export interface WeekFigure {
  label: string;
  value: string;
  hint?: string;
}

interface MyAttendanceTodayPanelProps {
  shiftName: string;
  shiftHours: string;
  elapsedSeconds: number;
  targetSeconds: number;
  statusKind: TodayPunchStatus;
  locationSelect: React.ReactNode;
  action: React.ReactNode;
  breakAction?: React.ReactNode;
  week?: {
    loggedHours: string;
    scheduleLabel: string;
    progress: number;
    figures?: WeekFigure[];
  } | null;
}

export function MyAttendanceTodayPanel({
  shiftName,
  shiftHours,
  elapsedSeconds,
  targetSeconds,
  statusKind,
  locationSelect,
  action,
  breakAction,
  week,
}: MyAttendanceTodayPanelProps) {
  const progress = Math.max(0, Math.min(100, week?.progress ?? 0));
  const hasAction = action != null && action !== false;

  return (
    <div className="workday-stack">
      <WorkdayClockCard
        statusKind={statusKind}
        elapsedSeconds={elapsedSeconds}
        targetSeconds={targetSeconds}
        shiftName={shiftName}
        shiftHours={shiftHours}
        locationSelect={locationSelect}
        secondaryAction={breakAction}
        primaryAction={hasAction ? action : undefined}
      />

      {week ? (
        <section className="workday-week" aria-label="This week">
          <h2 className="workday-week-title">This week</h2>
          <p className="workday-week-hours">
            <strong>{week.loggedHours}h</strong>
            <span> / {week.scheduleLabel}</span>
          </p>
          <div
            className="att-meter workday-week-meter"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            aria-label="Hours logged this week"
          >
            <span style={{ width: `${Math.max(progress, progress > 0 ? 2 : 0)}%` }} />
          </div>

          {week.figures && week.figures.length > 0 ? (
            <dl className="workday-week-figures">
              {week.figures.map((fig) => (
                <div key={fig.label} className="workday-week-figure" title={fig.hint}>
                  <dt>{fig.label}</dt>
                  <dd>{fig.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
