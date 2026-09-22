'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { GoogleIcon } from '@/components/ui/GoogleIcon';

export const UserActionCards: React.FC = () => {
  const router = useRouter();

  const cards = [
    {
      id: 'attendance',
      title: 'Attendance',
      path: '/attendance',
      iconName: 'event_available',
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
    },
    {
      id: 'leaves',
      title: 'Leaves',
      path: '/leaves',
      iconName: 'beach_access',
      iconBg: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
    },
    {
      id: 'tasks',
      title: 'Tasks',
      path: '/projects',
      iconName: 'task_alt',
      iconBg: 'bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400',
    },
    {
      id: 'payslips',
      title: 'Payslips',
      path: '/payroll',
      iconName: 'receipt_long',
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    },
  ];

  return (
    <section aria-label="Quick Actions" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
      {cards.map((card) => {
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => router.push(card.path)}
            className="dash-card dash-surface p-3.5 sm:p-5 text-left flex flex-col justify-between group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${card.iconBg}`}
              >
                <GoogleIcon name={card.iconName} size={20} weight={500} />
              </div>
              <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-slate-300 dark:text-slate-600 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/40 transition-[color,background-color] duration-150 ease-out">
                <GoogleIcon name="arrow_outward" size={15} weight={500} />
              </div>
            </div>

            <div className="mt-3 sm:mt-4">
              <h3 className="text-sm sm:text-base font-bold text-[var(--text-primary)] tracking-tight leading-tight">
                {card.title}
              </h3>
            </div>
          </button>
        );
      })}
    </section>
  );
};
