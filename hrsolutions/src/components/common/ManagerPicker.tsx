'use client';

import React from 'react';
import { Employee } from '@/types';

export const ManagerPicker: React.FC<{
  selectedIds: string[];
  employees: Employee[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  label: string;
}> = ({ selectedIds, employees, onChange, disabled, label }) => {
  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name || 'Unknown employee';
  const available = employees.filter((e) => !selectedIds.includes(e.id));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {selectedIds.length === 0 && (
        <span className="text-[12px] font-medium text-[var(--text-muted)]">No manager</span>
      )}
      {selectedIds.map((id, index) => (
        <span
          key={id}
          className="inline-flex items-center gap-1 rounded-[8px] border border-[var(--border-color,#dde4e9)] bg-white py-1 pl-2.5 pr-1 text-[12px] font-semibold text-[#172234]"
        >
          {nameOf(id)}
          {index === 0 && selectedIds.length > 1 && (
            <span className="rounded px-1 text-[12px] font-bold text-[var(--text-muted)]">Primary</span>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(selectedIds.filter((x) => x !== id))}
            className="inline-flex h-6 w-6 items-center justify-center rounded-[7px] text-[var(--text-muted)] hover:bg-[#faeeee] hover:text-[#8b3133] cursor-pointer disabled:cursor-not-allowed"
            aria-label={`Remove ${nameOf(id)} as manager of ${label}`}
          >
            ×
          </button>
        </span>
      ))}
      <select
        value=""
        disabled={disabled || available.length === 0}
        onChange={(e) => {
          if (e.target.value) onChange([...selectedIds, e.target.value]);
        }}
        aria-label={`Add manager to ${label}`}
        className="rounded-[7px] border border-[#c5d0d8] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#172234] outline-none focus:border-[#17324e] disabled:opacity-50"
      >
        <option value="">{selectedIds.length ? '+ Add another manager' : '+ Add manager'}</option>
        {available.map((emp) => (
          <option key={emp.id} value={emp.id}>
            {emp.name}
          </option>
        ))}
      </select>
    </div>
  );
};
