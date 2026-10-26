'use client';

import React from 'react';
import { formatDateDMY } from '@/utils/dates';

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  value?: string;
};

/**
 * Date field that always displays dd/mm/yyyy while keeping a YYYY-MM-DD value
 * for storage. Browsers ignore page locale for native date text, so we overlay
 * the formatted value and keep the native control for picking.
 */
export function DateInput({ value = '', className = '', ...props }: DateInputProps) {
  const display = formatDateDMY(value) || 'dd/mm/yyyy';
  const empty = !value;

  return (
    <span className="pixbe-date-input">
      <span className={`pixbe-date-input__display ${empty ? 'is-empty' : ''}`} aria-hidden="true">
        {display}
      </span>
      <input
        {...props}
        type="date"
        lang="en-GB"
        value={value}
        className={`pixbe-date-input__native ${className}`.trim()}
      />
    </span>
  );
}
