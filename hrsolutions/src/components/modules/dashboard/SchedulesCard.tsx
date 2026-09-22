'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { openExternalUrl } from '@/lib/native';
import { useRouter } from 'next/navigation';
import { Calendar, ChevronDown, Check, ArrowRight, Video, ExternalLink } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useDashboardContext } from './DashboardDataContext';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { TimesheetEntry } from '@/types';

type ScheduleFilter = 'all' | 'today' | 'this_week';

function isScheduleEntry(ts: TimesheetEntry): boolean {
  return ts.entryType === 'schedule' || ts.category === 'Meeting';
}

export const SchedulesCard: React.FC = () => {
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
    const all = Array.from(byId.values()).filter(isScheduleEntry);
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
  }, [dashboardState.timesheets, state.timesheets, filter, todayStr]);

  const currentDateFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const filterLabels: Record<ScheduleFilter, string> = {
    all: currentDateFormatted,
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

  return (
    <div className="dash-card p-5" data-purpose="schedules-list">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-[var(--text-primary)]">Schedules</h2>

        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>{filterLabels[filter]}</span>
            <ChevronDown
              className={`w-3 h-3 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180 text-blue-600' : ''}`}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-44 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
              {(['all', 'today', 'this_week'] as ScheduleFilter[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setFilter(opt);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition cursor-pointer ${
                    filter === opt ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>{filterLabels[opt]}</span>
                  {filter === opt && <Check className="w-3.5 h-3.5 text-blue-600" />}
                </button>
              ))}
              <div className="pt-1 mt-1 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    router.push('/timesheets');
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 flex items-center justify-between transition cursor-pointer"
                >
                  <span>Open Timesheets</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {dashboardState.loading ? (
        <div className="space-y-3">
          <Skeleton height="86px" borderRadius="0.75rem" />
          <Skeleton height="86px" borderRadius="0.75rem" />
          <Skeleton height="86px" borderRadius="0.75rem" />
        </div>
      ) : timesheets.length === 0 ? (
        <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
          <p className="text-xs font-medium">No schedules yet</p>
          <p className="text-[11px] mt-1 text-slate-400">
            Add one from Timesheets → Log Task → Schedule
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {timesheets.map((ts) => {
            const formattedDate = formatWorkDate(ts.date);
            const timeLabel =
              ts.startTime && ts.endTime
                ? `${ts.startTime} – ${ts.endTime}`
                : ts.hours
                  ? `${ts.hours} hrs`
                  : 'Scheduled';

            return (
              <div
                key={ts.id}
                onClick={() => router.push('/timesheets')}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50 hover:border-slate-200 transition cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    {ts.projectName || 'Operations'}
                  </span>
                  {ts.meetingLink && (
                    <a
                      href={ts.meetingLink}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void openExternalUrl(String(ts.meetingLink));
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1a73e8] hover:underline shrink-0"
                      title="Open meeting link"
                    >
                      <Video className="w-3 h-3" />
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>

                <h3 className="text-xs font-bold text-[var(--text-primary)] truncate">
                  {ts.taskTitle || ts.description || 'Scheduled activity'}
                </h3>

                <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium text-slate-500 truncate">{timeLabel}</span>
                    <span>•</span>
                    <span className="shrink-0">{formattedDate}</span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <UserAvatar
                      src={state.employees?.find((e) => e.id === ts.employeeId || e.name === ts.employeeName)?.avatar}
                      name={ts.employeeName}
                      className="w-5 h-5 text-[9px] shrink-0"
                    />
                    <span className="text-[11px] font-medium text-slate-600 truncate max-w-[100px]">
                      {ts.employeeName}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
