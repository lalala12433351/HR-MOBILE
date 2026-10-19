'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronDown, Check, ArrowRight, Video, ExternalLink } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { TimesheetEntry } from '@/types';
import { DashPanel } from './DashPanel';

type ScheduleFilter = 'all' | 'today' | 'this_week';

function isScheduleEntry(ts: TimesheetEntry): boolean {
  return ts.entryType === 'schedule' || ts.category === 'Meeting';
}

export const SchedulesCard: React.FC<{ className?: string }> = ({ className = '' }) => {
  const router = useRouter();
  const { state } = useApp();
  const dashboardState = useDashboardContext();
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const timesheets = useMemo(() => {
    const dash = dashboardState.timesheets || [];
    const app = state.timesheets || [];
    const byId = new Map<string, TimesheetEntry>();
    for (const ts of [...dash, ...app]) {
      const prev = byId.get(ts.id);
      byId.set(ts.id, prev ? { ...prev, ...ts } : ts);
    }
    const personaId = state.currentPersona?.id;
    const personaName = state.currentPersona?.name?.toLowerCase();
    // Dashboard schedules are always personal — even for admins.
    const all = Array.from(byId.values()).filter((ts) => {
      if (!isScheduleEntry(ts)) return false;
      const isMine =
        (!!personaId && ts.employeeId === personaId) ||
        (!!personaName && ts.employeeName?.toLowerCase() === personaName);
      return isMine;
    });
    let filtered = all;
    if (filter === 'today') {
      filtered = all.filter((ts) => ts.date && ts.date.startsWith(todayStr));
    } else if (filter === 'this_week') {
      const now = new Date();
      const day = now.getDay();
      const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now);
      monday.setDate(diffToMonday);
      const mondayStr = monday.toISOString().split('T')[0];
      filtered = all.filter((ts) => ts.date && ts.date >= mondayStr);
    }
    return [...filtered]
      .sort((a, b) => {
        const d = (a.date || '').localeCompare(b.date || '');
        if (d !== 0) return d;
        return String(a.startTime || '').localeCompare(String(b.startTime || ''));
      })
      .slice(0, 5);
  }, [dashboardState.timesheets, state.timesheets, state.currentPersona, filter, todayStr]);

  const currentDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const filterLabels: Record<ScheduleFilter, string> = {
    all: 'All',
    today: 'Today',
    this_week: 'This Week',
  };

  const formatWorkDate = (dateStr?: string) => {
    if (!dateStr) return currentDateFormatted;
    try {
      const cleanStr = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const d = new Date(cleanStr + 'T00:00:00');
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return dateStr;
    }
  };

  const filterControl = (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-medium rounded-[7px] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] transition-[background-color,border-color] duration-150 cursor-pointer"
      >
        <Calendar className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span>{filterLabels[filter]}</span>
        <ChevronDown
          className={`w-3 h-3 text-[var(--text-muted)] transition-transform ${dropdownOpen ? 'rotate-180 text-[var(--studio-navy)]' : ''}`}
        />
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--bg-surface)] rounded-[9px] border border-[var(--border-color)] py-1 z-50">
          {(['all', 'today', 'this_week'] as ScheduleFilter[]).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setFilter(opt);
                setDropdownOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between cursor-pointer ${
                filter === opt ? 'bg-[var(--studio-selected)] text-[var(--studio-navy)] font-bold' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-subtle)]'
              }`}
            >
              <span>{filterLabels[opt]}</span>
              {filter === opt && <Check className="w-3.5 h-3.5 text-[var(--studio-navy)]" />}
            </button>
          ))}
          <div className="pt-1 mt-1 border-t border-[var(--border-color)]">
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                router.push('/timesheets');
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-bold text-[var(--studio-navy)] hover:bg-[var(--studio-selected)] flex items-center justify-between cursor-pointer"
            >
              <span>Open timesheets</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <DashPanel title="Schedules" action={filterControl} className={className} purpose="schedules-list">
      {dashboardState.loading ? (
        <div className="space-y-3">
          <Skeleton height="48px" borderRadius="8px" />
          <Skeleton height="48px" borderRadius="8px" />
          <Skeleton height="48px" borderRadius="8px" />
        </div>
      ) : timesheets.length === 0 ? (
        <div className="dash-empty-state">
          <p>No schedules yet</p>
          <p>Add one from Timesheets → Log Task → Schedule</p>
        </div>
      ) : (
        <div>
          {timesheets.map((ts) => {
            const formattedDate = formatWorkDate(ts.date);
            const timeLabel =
              ts.startTime && ts.endTime
                ? `${ts.startTime} – ${ts.endTime}`
                : ts.hours
                  ? `${ts.hours} hrs`
                  : 'Scheduled';

            return (
              <button
                key={ts.id}
                type="button"
                onClick={() => router.push('/timesheets')}
                className="dash-row dash-row--clickable"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">
                    {ts.taskTitle || ts.description || 'Scheduled activity'}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)] truncate">
                    {ts.projectName || 'Operations'} · {timeLabel} · {formattedDate}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {ts.meetingLink && (
                    <a
                      href={ts.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--primary-blue)] hover:underline"
                      title="Open meeting link"
                    >
                      <Video className="w-3 h-3" />
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                  <UserAvatar
                    src={state.employees?.find((e) => e.id === ts.employeeId || e.name === ts.employeeName)?.avatar}
                    name={ts.employeeName}
                    className="w-5 h-5 text-[9px] shrink-0"
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </DashPanel>
  );
};
