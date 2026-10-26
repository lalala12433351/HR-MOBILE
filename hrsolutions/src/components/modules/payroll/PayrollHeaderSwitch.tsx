'use client';

import Link from 'next/link';

export function PayrollHeaderSwitch({ active }: { active: 'payroll' | 'billable' }) {
  return (
    <nav className="finance-workspace-switch" aria-label="Payroll workspace">
      <Link href="/payroll" aria-current={active === 'payroll' ? 'page' : undefined}>Payroll</Link>
      <Link href="/payroll/billable" aria-current={active === 'billable' ? 'page' : undefined}>Billable</Link>
    </nav>
  );
}
