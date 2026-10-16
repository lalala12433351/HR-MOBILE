'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Calendar, ShieldCheck, Sun, Moon, MapPin, ChevronRight } from 'lucide-react';
import { UserPersona } from '../../types';

interface EmployeeTimePanelProps {
  currentPersona?: UserPersona;
  variant?: 'header' | 'banner' | 'card' | 'shift_card';
  compact?: boolean;
  onClockOut?: () => void;
  onPunch?: () => void;
}

export const EmployeeTimePanel: React.FC<EmployeeTimePanelProps> = ({
  currentPersona,
  variant = 'header',
  compact = false,
  onClockOut,
  onPunch,
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Formatters
  const dayName = time.toLocaleDateString('en-US', { weekday: 'long' });
  const dayShort = time.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNumber = time.getDate();
  const monthShort = time.toLocaleDateString('en-US', { month: 'short' });
  const fullDate = time.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeString = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const isNight = time.getHours() < 6 || time.getHours() >= 18;

  if (variant === 'header') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#232d44] bg-[#161d2e] px-3.5 py-1.5 shadow-sm">
        {/* Top: Day and Date */}
        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-[#a78bfa] tracking-tight leading-none">
            <Calendar className="h-3.5 w-3.5 text-[#7c5cfc] shrink-0" />
            <span>{dayName}, {fullDate}</span>
          </div>
          <p className="text-[10px] font-semibold text-[#8e9eb5] mt-0.5 leading-none">
            {currentPersona ? `${currentPersona.name.split(' ')[0]}'s Workspace` : 'Employee Workstation'}
          </p>
        </div>

        {/* Divider line */}
        <div className="h-7 w-[1px] bg-[#232d44]" />

        {/* Side: Real-time Live Clock */}
        <div className="flex items-center gap-1.5 bg-[#0f1422] text-[#2dd4bf] border border-[#232d44] rounded-lg px-2.5 py-1 font-mono text-xs font-bold tabular-nums ">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2dd4bf] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2dd4bf]"></span>
          </span>
          <span className="tracking-wider text-[#2dd4bf]">{timeString}</span>
        </div>
      </div>
    );
  }

  if (variant === 'banner' || variant === 'shift_card') {
    return (
      <div className="rounded-xl border border-[#232d44] bg-[#161d2e] p-4 sm:p-5 text-white shadow-lg space-y-4">
        {/* Top Bar with shift info */}
        <div className="flex items-center justify-between border-b border-[#232d44] pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#ff5e62]/20 text-[#ff5e62]">
              <Clock className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-bold text-[#8e9eb5] tracking-wide uppercase">
              Shift Today : General (8:00 AM - 11:00 PM)
            </span>
          </div>
          <span className="text-xs font-medium text-[#596b84] flex items-center gap-1">
            0h / 14h <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>

        {/* Middle Date Row & Quick Action Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {dayNumber} {monthShort} {dayShort}
            </p>
            <p className="text-xs text-[#8e9eb5] mt-0.5">
              Standard IST Working Hours • Real-time GPS verification active
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Clock Out Button */}
            <button
              onClick={onClockOut}
              className="flex items-center justify-center rounded-lg bg-[#ff5e62] hover:bg-[#fa4b50] px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all active:scale-95"
            >
              Clock Out
            </button>

            {/* Live Timer Indicator Box */}
            <div className="flex items-center gap-2 rounded-lg border border-[#ff5e62]/40 bg-[#131929] px-3.5 py-2">
              <span className="h-2 w-2 rounded-full bg-[#ff5e62] animate-ping" />
              <div className="text-right font-mono">
                <p className="text-xs font-bold text-[#ff5e62] leading-none tabular-nums">{timeString}</p>
                <p className="text-[9px] text-[#8e9eb5] font-sans font-medium mt-0.5">Live Counter</p>
              </div>
            </div>

            {/* Punch Button with Location */}
            <button
              onClick={onPunch}
              className="flex items-center gap-1.5 rounded-lg border border-[#7c5cfc] bg-[#7c5cfc]/20 hover:bg-[#7c5cfc]/30 px-3.5 py-2.5 text-xs font-bold text-[#c4b5fd] shadow-md transition-all active:scale-95"
            >
              <MapPin className="h-3.5 w-3.5 text-[#a78bfa]" />
              Punch
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default 'card' variant
  return (
    <div className="rounded-xl border border-[#232d44] bg-[#161d2e] p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#a78bfa]">Workstation Schedule</span>
        <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5 mt-0.5">
          <Calendar className="h-4 w-4 text-[#7c5cfc]" />
          <span>{dayName}, {fullDate}</span>
        </h3>
      </div>

      <div className="flex items-center gap-2 bg-[#0f1422] text-[#2dd4bf] border border-[#232d44] font-mono text-sm font-bold px-3 py-1.5 rounded-lg ">
        <Clock className="h-4 w-4 text-[#2dd4bf]" />
        <span>{timeString}</span>
      </div>
    </div>
  );
};
