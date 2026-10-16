import React from 'react';

export const DepartmentCodeBadge: React.FC<{ code?: string; className?: string }> = ({ code, className = '' }) =>
  code ? (
    <span
      className={`inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-px font-mono text-[10px] font-semibold lowercase tracking-wide text-slate-500 ${className}`}
    >
      {code}
    </span>
  ) : null;

export const DepartmentTag: React.FC<{ name: string; code?: string; className?: string }> = ({
  name,
  code,
  className = '',
}) => (
  <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
    <span className="truncate">{name}</span>
    <DepartmentCodeBadge code={code} />
  </span>
);
