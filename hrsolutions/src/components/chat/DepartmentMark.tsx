import React from 'react';

/** Connected work units: a custom department mark, drawn for the chat rail. */
export function DepartmentMark({ className = '' }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" focusable="false">
      <path d="M8 6h8M6 8v8m12-8v8m-10 2h8" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="2.5" width="7" height="7" rx="2" fill="currentColor" />
      <rect x="14.5" y="2.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="14.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14.5" y="14.5" width="7" height="7" rx="2" fill="currentColor" />
    </svg>
  );
}
