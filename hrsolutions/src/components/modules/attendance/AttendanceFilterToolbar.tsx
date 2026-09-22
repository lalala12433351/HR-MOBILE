'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

export interface AttendanceFilterSelect {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  'aria-label'?: string;
}

interface AttendanceFilterToolbarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  leading?: React.ReactNode;
  selects?: AttendanceFilterSelect[];
  trailing?: React.ReactNode;
  className?: string;
}

export function AttendanceFilterToolbar({
  searchPlaceholder = 'Search…',
  searchValue,
  onSearchChange,
  leading,
  selects = [],
  trailing,
  className = '',
}: AttendanceFilterToolbarProps) {
  const showSearch = typeof onSearchChange === 'function';

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs ${className}`}
    >
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 min-w-0">
        {leading}
        {showSearch && (
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchValue ?? ''}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:bg-white focus:border-blue-500 transition-[background-color,border-color] duration-150 ease-out"
            />
            {searchValue ? (
              <button
                type="button"
                onClick={() => onSearchChange?.('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer active:scale-95 transition-transform duration-100"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
        {selects.map((sel) => (
          <select
            key={sel.id}
            value={sel.value}
            onChange={(e) => sel.onChange(e.target.value)}
            aria-label={sel['aria-label']}
            className="bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 px-3 py-2 rounded-xl outline-none focus:bg-white focus:border-blue-500 cursor-pointer transition-[background-color,border-color] duration-150 ease-out min-w-0 flex-1 sm:flex-none"
          >
            {sel.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}
        {trailing}
      </div>
    </div>
  );
}
