'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { useApp } from '@/context/AppContext';
import { DashPanel } from './DashPanel';
import { dateKey, formatWeekday, localDateKey, upcomingHolidays } from '@/utils/dashboardPeople';

type UpcomingHolidaysCardProps = {
  className?: string;
  limit?: number;
  manageHref?: boolean;
};

export const UpcomingHolidaysCard: React.FC<UpcomingHolidaysCardProps> = ({
  className = '',
  limit = 6,
  manageHref = false,
}) => {
  const router = useRouter();
  const { state } = useApp();
  const today = localDateKey();

  const holidays = useMemo(
    () => upcomingHolidays(state.customOptions?.holidays, today, limit),
    [state.customOptions?.holidays, today, limit]
  );

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <DashPanel
      title="Upcoming holidays"
      className={className}
      purpose="upcoming-holidays"
      action={
        <button
          type="button"
          onClick={() => router.push('/attendance?tab=holidays')}
          className="text-xs font-semibold text-[var(--studio-navy)] hover:underline inline-flex items-center gap-1 cursor-pointer"
        >
          {manageHref ? 'Calendar' : 'All'}
          <GoogleIcon name="arrow_forward" size={15} weight={600} />
        </button>
      }
    >
      {holidays.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-[var(--text-muted)]">No upcoming holidays</p>
      ) : (
        <ul className="m-0 p-0 list-none">
          {holidays.map((holiday) => {
            const key = dateKey(holiday.date);
            const d = new Date(`${key}T00:00:00`);
            const isToday = key === today;
            return (
              <li key={holiday.id} className="dash-people-row">
                <span className="dash-date-tile" aria-hidden="true">
                  <b>{Number.isNaN(d.getTime()) ? '—' : d.getDate()}</b>
                  <small>{Number.isNaN(d.getTime()) ? '' : monthNames[d.getMonth()]}</small>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="dash-people-name">{holiday.name}</p>
                  <p className="dash-people-meta">
                    {isToday ? 'Today' : formatWeekday(holiday.date) || holiday.dayOfWeek}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashPanel>
  );
};
