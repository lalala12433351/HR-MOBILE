import { AttendanceRecord } from '@/types';
import { applyRemoteCheckout } from '@/utils/attendancePunches';

export type AttendanceCheckoutDetail = {
  employeeId: string;
  workDate: string;
  checkOutLabel: string;
};

const EVENT = 'hr-attendance-checkout';

export function publishAttendanceCheckout(detail: AttendanceCheckoutDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AttendanceCheckoutDetail>(EVENT, { detail }));
}

export function subscribeAttendanceCheckout(handler: (detail: AttendanceCheckoutDetail) => void) {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AttendanceCheckoutDetail>).detail;
    if (detail?.employeeId && detail.workDate && detail.checkOutLabel) handler(detail);
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function patchAttendanceCheckout(rows: AttendanceRecord[], detail: AttendanceCheckoutDetail) {
  return applyRemoteCheckout(rows, detail);
}
