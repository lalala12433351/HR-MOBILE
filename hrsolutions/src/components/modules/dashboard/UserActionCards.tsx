'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { PixbeIcon, PixbeIconName } from '@/components/common/PixbeIcon';
import { DashboardClockInCard } from './DashboardClockInCard';
import { OnLeaveTodayCard } from './OnLeaveTodayCard';
import { UpcomingHolidaysCard } from './UpcomingHolidaysCard';

export const UserActionCards: React.FC = () => {
  const router = useRouter();

  const cards = [
    {
      id: 'leaves',
      title: 'Request leave',
      description: 'Apply or check a balance',
      path: '/leaves',
      iconName: 'leave-action' as PixbeIconName,
    },
    {
      id: 'tasks',
      title: 'Open tasks',
      description: 'See what is assigned to you',
      path: '/projects',
      iconName: 'tasks-action' as PixbeIconName,
    },
    {
      id: 'payslips',
      title: 'Get a payslip',
      description: 'Download a recent slip',
      path: '/payroll',
      iconName: 'payslips-action' as PixbeIconName,
    },
  ];

  return (
    <section aria-label="Today’s work" className="dash-figures dash-figures--member">
      <div className="dash-workday">
        <DashboardClockInCard />
      </div>

      <div className="dash-action-rail">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => router.push(card.path)}
            className="dash-action"
          >
            <span className="inline-flex items-center gap-3 min-w-0">
              <PixbeIcon name={card.iconName} className="h-4 w-4 text-[var(--studio-navy)] shrink-0" />
              <span className="dash-action-copy">
                <strong>{card.title}</strong>
                <small>{card.description}</small>
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="dash-today-fill">
        <OnLeaveTodayCard scope="coworkers" limit={4} />
        <UpcomingHolidaysCard limit={4} />
      </div>
    </section>
  );
};
