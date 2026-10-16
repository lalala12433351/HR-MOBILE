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
    <div className={`work-toolbar ${className}`}>
      {leading}
      {showSearch && (
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)] pointer-events-none" />
          <input
            type="text"
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="work-field w-full pl-10 pr-8"
          />
          {searchValue ? (
            <button
              type="button"
              onClick={() => onSearchChange?.('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      )}
      {selects.map((sel) => (
        <select
          key={sel.id}
          value={sel.value}
          onChange={(e) => sel.onChange(e.target.value)}
          aria-label={sel['aria-label']}
          className="work-field min-w-0 flex-1 sm:flex-none"
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
  );
}
