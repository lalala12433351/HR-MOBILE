'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';

/** Helper to convert raw strings/JSON from audit log details into human-readable copy */
function formatLogDetails(rawDetails: any, action?: string, entity?: string): string {
  if (!rawDetails) {
    if (action && entity) return `${action.replace(/_/g, ' ').toLowerCase()} on ${entity}`;
    return action ? action.replace(/_/g, ' ') : 'Activity updated';
  }

  let parsed = rawDetails;
  if (typeof rawDetails === 'string') {
    const trimmed = rawDetails.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        parsed = rawDetails;
      }
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    // 1. Explicit message property
    if (parsed.message && typeof parsed.message === 'string') {
      return parsed.message;
    }

    // 2. Payroll payout objects: { year: 2026, month: 8, total_payout: 440000 }
    if (parsed.total_payout !== undefined) {
      const amount =
        typeof parsed.total_payout === 'number'
          ? `₹${parsed.total_payout.toLocaleString('en-IN')}`
          : `₹${parsed.total_payout}`;
      if (parsed.month && parsed.year) {
        const monthNames = [
          'January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const monthIdx = Number(parsed.month) - 1;
        const monthLabel = monthNames[monthIdx] || `Month ${parsed.month}`;
        return `Processed payroll payout of ${amount} for ${monthLabel} ${parsed.year}`;
      }
      return `Processed payroll payout of ${amount}`;
    }

    // 3. Status updates or batch operations
    if (parsed.status && parsed.count !== undefined) {
      return `Updated ${parsed.count} items to status: ${parsed.status}`;
    }

    // 4. Fallback for other key-value objects
    const formattedPairs = Object.entries(parsed)
      .filter(([_, v]) => v !== null && v !== undefined && typeof v !== 'object')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);

    if (formattedPairs.length > 0) {
      return formattedPairs.join(', ');
    }
  }

  return String(rawDetails);
}

/** Helper to choose contextual icon & soft color scheme for each activity type */
function getActivityBadge(action = '', entity = '', details = '') {
  const combined = `${action} ${entity} ${details}`.toUpperCase();

  if (combined.includes('PAYROLL') || combined.includes('PAYOUT') || combined.includes('SALARY') || combined.includes('PAYSLIP')) {
    return {
      iconName: 'payments',
      bgClass: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40',
    };
  }
  if (combined.includes('WORKSPACE') || combined.includes('SETUP') || combined.includes('DATABASE') || combined.includes('INITIALIZE') || combined.includes('POSTGRES')) {
    return {
      iconName: 'database',
      bgClass: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40',
    };
  }
  if (combined.includes('PERSONA') || combined.includes('SWITCH') || combined.includes('LOGIN') || combined.includes('AUTH') || combined.includes('USER')) {
    return {
      iconName: 'person',
      bgClass: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40',
    };
  }
  if (combined.includes('PROJECT') || combined.includes('TASK') || combined.includes('BOARD') || combined.includes('ASSIGN')) {
    return {
      iconName: 'assignment',
      bgClass: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40',
    };
  }
  if (combined.includes('ATTENDANCE') || combined.includes('PUNCH') || combined.includes('CLOCK') || combined.includes('TIMESHEET')) {
    return {
      iconName: 'schedule',
      bgClass: 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/40',
    };
  }
  if (combined.includes('LEAVE') || combined.includes('HOLIDAY') || combined.includes('VACATION')) {
    return {
      iconName: 'beach_access',
      bgClass: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/40',
    };
  }
  if (combined.includes('STUDENT') || combined.includes('CLASS') || combined.includes('COURSE') || combined.includes('BATCH')) {
    return {
      iconName: 'school',
      bgClass: 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-900/40',
    };
  }

  return {
    iconName: 'verified_user',
    bgClass: 'bg-slate-100 dark:bg-[#202024] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#282830]',
  };
}

/** Format timestamp into compact human-readable time */
function formatLogTime(timestamp?: string): string {
  if (!timestamp) return 'Recent';
  try {
    const date = new Date(timestamp.includes(' ') ? timestamp.replace(' ', 'T') : timestamp);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  } catch {}
  if (timestamp.includes('T')) {
    return timestamp.split('T')[1]?.slice(0, 5) || 'Recent';
  }
  return timestamp.slice(11, 16) || 'Recent';
}

export const RecentActivitiesCard: React.FC = () => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();

  const displayItems = React.useMemo(() => {
    const auditLogs = dashboardState.auditLogs || [];
    return auditLogs.slice(0, 5).map((log) => {
      const formattedText = formatLogDetails(log.details, log.action, log.entity);
      const badge = getActivityBadge(log.action, log.entity, formattedText);
      const timeStr = formatLogTime(log.timestamp);

      return {
        id: log.id,
        user: log.user || 'System User',
        text: formattedText,
        time: timeStr,
        badge,
      };
    });
  }, [dashboardState.auditLogs]);

  return (
    <div
      className="dash-card p-5"
      data-purpose="recent-activities"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-[var(--text-primary)]">Recent Activities</h2>
        <button
          type="button"
          onClick={() => router.push('/notifications')}
          className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer inline-flex items-center gap-1 transition-colors"
        >
          <span>View All Log</span>
          <GoogleIcon name="arrow_forward" size={14} />
        </button>
      </div>

      {displayItems.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-[#282830] rounded-xl">
          <p>No recent activity logs recorded yet</p>
        </div>
      ) : (
        <div className="space-y-3.5 divide-y divide-slate-100/80 dark:divide-[#222228]">
          {displayItems.map((item, idx) => (
            <div key={item.id} className={`flex items-start gap-3 ${idx > 0 ? 'pt-3.5' : ''}`}>
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${item.badge.bgClass}`}
              >
                <GoogleIcon name={item.badge.iconName} size={17} weight={500} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <strong className="font-semibold text-slate-900 dark:text-white mr-1.5">{item.user}</strong>
                  <span>{item.text}</span>
                </p>
                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-0.5 block">
                  {item.time}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
