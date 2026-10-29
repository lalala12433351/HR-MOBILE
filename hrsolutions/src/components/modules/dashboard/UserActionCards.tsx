'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, ListTodo, FileText, ArrowUpRight } from 'lucide-react';
import { DashboardClockInCard } from './DashboardClockInCard';

export const UserActionCards: React.FC<{ showClock?: boolean }> = ({ showClock = true }) => {
  const router = useRouter();

  const cards = [
    {
      id: 'leaves',
      title: 'Request leave',
      description: 'Apply or check a balance',
      path: '/leaves',
      icon: CalendarPlus,
    },
    {
      id: 'tasks',
      title: 'Open tasks',
      description: 'See what is assigned to you',
      path: '/projects',
      icon: ListTodo,
    },
    {
      id: 'payslips',
      title: 'Get a payslip',
      description: 'Download a recent slip',
      path: '/payslips',
      icon: FileText,
    },
  ];

  return (
    <section aria-label="Today’s work" className={`dash-figures dash-figures--member ${showClock ? '' : 'dash-figures--actions-only'}`}>
      {showClock && (
        <div className="dash-workday">
          <DashboardClockInCard />
        </div>
      )}

      <div className="dash-action-rail">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => router.push(card.path)}
            className="dash-action"
          >
            <ArrowUpRight size={14} className="dash-action-arrow" aria-hidden="true" />
            <span className="inline-flex items-center gap-3 min-w-0">
              <card.icon size={18} className="text-[var(--primary-blue)] shrink-0" aria-hidden="true" />
              <span className="dash-action-copy">
                <strong>{card.title}</strong>
                <small>{card.description}</small>
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};
