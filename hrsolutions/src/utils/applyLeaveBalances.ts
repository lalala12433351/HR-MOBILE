import { Employee } from '@/types';

function balanceEmployeeId(b: any): string {
  return String(b?.employeeId || b?.employee_id || '').trim();
}

/** Merge GET /attendance/leave-balances rows onto employees for leaveRules. */
export function applyLeaveBalancesToEmployees(
  employees: Employee[],
  balances: any
): Employee[] {
  const list = Array.isArray(balances) ? balances : balances ? [balances] : [];
  if (!list.length || !employees.length) return employees;

  const byEmp = new Map<string, any>();
  for (const b of list) {
    const id = balanceEmployeeId(b);
    if (id) byEmp.set(id, b);
  }

  return employees.map((emp) => {
    const bal = byEmp.get(String(emp.id)) || (emp.employeeId ? byEmp.get(String(emp.employeeId)) : undefined);
    if (!bal) return emp;
    return {
      ...emp,
      leaveBalancesFromServer: true,
      leaveBalances: {
        casualLeave: Number(bal.casualLeave ?? bal.casual_leave ?? 0),
        sickLeave: Number(bal.sickLeave ?? bal.sick_leave ?? 0),
        earnedLeave: Number(bal.earnedLeave ?? bal.earned_leave ?? 0),
        compOff: Number(bal.wfh ?? bal.compOff ?? 0),
      },
      leaveBalanceTotals: bal.totals
        ? {
            casualLeave: Number(bal.totals.casualLeave ?? 0),
            sickLeave: Number(bal.totals.sickLeave ?? 0),
            earnedLeave: Number(bal.totals.earnedLeave ?? 0),
            compOff: Number(bal.totals.wfh ?? bal.totals.compOff ?? 0),
          }
        : undefined,
    } as Employee;
  });
}
