import { Employee, LeaveRequest, UserPersona } from '@/types';

type LeaveOwnerRef = {
  id?: string | null;
  employeeId?: string | null;
  name?: string | null;
  fullName?: string | null;
  email?: string | null;
};

/**
 * Strict leave→person match. Never treats empty ids/names as a match, so one
 * employee's leave cannot drain everyone else's client-side remaining balance.
 */
export function leaveBelongsToEmployee(
  leave: Pick<LeaveRequest, 'employeeId' | 'employeeName'> | null | undefined,
  person: LeaveOwnerRef | Employee | UserPersona | null | undefined
): boolean {
  if (!leave || !person) return false;

  const leaveId = String(leave.employeeId || '').trim();
  const personIds = [person.id, (person as LeaveOwnerRef).employeeId]
    .map((id) => String(id || '').trim())
    .filter(Boolean);

  if (leaveId && personIds.includes(leaveId)) return true;

  const leaveName = String(leave.employeeName || '').trim().toLowerCase();
  const personName = String(
    (person as LeaveOwnerRef).name || (person as LeaveOwnerRef).fullName || ''
  )
    .trim()
    .toLowerCase();
  if (leaveName && personName && leaveName === personName) return true;

  return false;
}

/** Map a backend leave_requests row (snake_case) to the FE LeaveRequest shape. */
export function mapLeaveRow(l: any): LeaveRequest {
  const rawType = String(l.leave_type || l.leaveType || '').toLowerCase().trim();
  let leaveType: LeaveRequest['leaveType'] = 'Casual Leave';
  if (rawType === 'sick' || rawType.includes('sick')) leaveType = 'Sick Leave';
  else if (rawType === 'earned' || rawType.includes('earned')) leaveType = 'Earned Leave';
  else if (rawType === 'unpaid' || rawType.includes('unpaid') || rawType.includes('loss')) leaveType = 'Loss of Pay';
  else if (rawType === 'wfh' || rawType.includes('work from home') || rawType === 'home') leaveType = 'Work From Home';

  const rawStatus = String(l.status || '').toLowerCase().trim();
  let status: LeaveRequest['status'] = 'Pending';
  if (rawStatus === 'approved') status = 'Approved';
  else if (rawStatus === 'rejected') status = 'Rejected';
  else if (rawStatus === 'cancelled') status = 'Cancelled';

  const startRaw = l.start_date || l.startDate || '';
  const endRaw = l.end_date || l.endDate || '';
  const startDate = startRaw ? String(startRaw).slice(0, 10) : '';
  const endDate = endRaw ? String(endRaw).slice(0, 10) : '';

  return {
    id: l.id,
    employeeId: l.employee_id || l.employeeId || '',
    employeeName: l.employee_name || l.employeeName || '',
    department: (l.department_name || l.department || '') as LeaveRequest['department'],
    leaveType,
    startDate,
    endDate,
    daysCount: Number(l.days_count ?? l.daysCount ?? 1) || 1,
    reason: l.reason || '',
    status,
    appliedOn: l.created_at
      ? String(l.created_at).slice(0, 10)
      : l.appliedOn || startDate,
    approvedBy: l.approver_name || l.approvedBy || undefined,
    isPaid: leaveType !== 'Loss of Pay' && leaveType !== 'Unpaid Leave',
  };
}

/** Map display leave type labels to API/DB enum values. */
export function toApiLeaveType(display: string): 'casual' | 'sick' | 'earned' | 'unpaid' | 'wfh' {
  const s = (display || '').toLowerCase();
  if (s.includes('sick')) return 'sick';
  if (s.includes('earned')) return 'earned';
  if (s.includes('unpaid') || s.includes('loss')) return 'unpaid';
  if (s.includes('wfh') || s.includes('work from home') || s.includes('home')) return 'wfh';
  return 'casual';
}
