'use client';

import Link from 'next/link';

export function PayrollHeaderSwitch({ active }: { active: 'payroll' | 'billable' }) {
  const item = (href: string, label: string, isActive: boolean) => (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={`no-underline ${
        isActive
          ? 'text-[var(--text-primary)]'
          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <h1 className="text-[clamp(18px,1.7vw,22px)] font-bold tracking-[-0.02em]">
      {item('/payroll', 'Payroll', active === 'payroll')}
      <span className="mx-1.5 font-semibold text-[var(--text-muted)]" aria-hidden="true">
        /
      </span>
      {item('/payroll/billable', 'Billable', active === 'billable')}
    </h1>
  );
}
