'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardContext } from './DashboardDataContext';
import { DashPanel } from './DashPanel';

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
  const tone = 'bg-[var(--bg-surface-subtle)] text-[var(--studio-navy)] border border-[var(--border-color)]';

  if (combined.includes('PAYROLL') || combined.includes('PAYOUT') || combined.includes('SALARY') || combined.includes('PAYSLIP')) {
    return { iconName: 'payments', bgClass: tone };
  }
  if (combined.includes('WORKSPACE') || combined.includes('SETUP') || combined.includes('DATABASE') || combined.includes('INITIALIZE') || combined.includes('POSTGRES')) {
    return { iconName: 'database', bgClass: tone };
  }
  if (combined.includes('PERSONA') || combined.includes('SWITCH') || combined.includes('LOGIN') || combined.includes('AUTH') || combined.includes('USER')) {
    return { iconName: 'person', bgClass: tone };
  }
  if (combined.includes('PROJECT') || combined.includes('TASK') || combined.includes('BOARD') || combined.includes('ASSIGN')) {
    return { iconName: 'assignment', bgClass: tone };
  }
  if (combined.includes('ATTENDANCE') || combined.includes('PUNCH') || combined.includes('CLOCK') || combined.includes('TIMESHEET')) {
    return { iconName: 'schedule', bgClass: tone };
  }
  if (combined.includes('LEAVE') || combined.includes('HOLIDAY') || combined.includes('VACATION')) {
    return { iconName: 'beach_access', bgClass: tone };
  }
  if (combined.includes('STUDENT') || combined.includes('CLASS') || combined.includes('COURSE') || combined.includes('BATCH')) {
    return { iconName: 'school', bgClass: tone };
  }

  return { iconName: 'verified_user', bgClass: tone };
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

export const RecentActivitiesCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
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
    <DashPanel
      title="Recent activity"
      className={`${className} ${displayItems.length === 0 ? 'dash-panel--empty-work' : ''}`.trim()}
      purpose="recent-activities"
      action={
        <button
          type="button"
          onClick={() => router.push('/notifications')}
          className="dash-quiet-link"
        >
          View all ›
        </button>
      }
    >
      {displayItems.length === 0 ? (
        <div className="dash-work-empty">
          <p className="dash-work-empty-title">No recent activity yet</p>
          <p className="dash-work-empty-description">Updates from your workspace will appear here.</p>
        </div>
      ) : (
        <div>
          {displayItems.map((item) => (
            <div key={item.id} className="dash-row">
              <span className="dash-initials" aria-hidden>
                {item.user
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase())
                  .join('')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="dash-people-name">{item.user}</p>
                <p className="dash-people-meta">{item.text}</p>
              </div>
              <span className="dash-people-return">{item.time}</span>
            </div>
          ))}
        </div>
      )}
    </DashPanel>
  );
};
