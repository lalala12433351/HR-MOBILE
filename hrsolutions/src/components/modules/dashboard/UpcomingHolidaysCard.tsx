'use client';

import React, { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
          className="dash-quiet-link"
        >
          Calendar ›
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
                <CalendarDays size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="dash-people-name">{holiday.name}</p>
                  <p className="dash-people-meta">
                    {Number.isNaN(d.getTime())
                      ? holiday.dayOfWeek
                      : `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`}
                    {isToday ? '' : formatWeekday(holiday.date) ? ` · ${formatWeekday(holiday.date)}` : ''}
                  </p>
                </div>
                <span className="dash-people-return">
                  {Number.isNaN(d.getTime())
                    ? ''
                    : (() => {
                        const start = new Date();
                        start.setHours(0, 0, 0, 0);
                        const days = Math.round((d.getTime() - start.getTime()) / 86400000);
                        if (days <= 0) return 'Today';
                        return days === 1 ? '1 day' : `${days} days`;
                      })()}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </DashPanel>
  );
};
