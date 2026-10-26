'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/services/apiClient';
import { latestWfhRegularizationStatus } from '@/utils/wfhRegularization';

/** While a WFH session is open, watch for a manager rejection and punch the employee out. */
export function useWfhRejectionWatch(
  enabled: boolean,
  employeeId: string | undefined,
  date: string,
  onRejected: () => void
) {
  const onRejectedRef = useRef(onRejected);
  onRejectedRef.current = onRejected;

  useEffect(() => {
    if (!enabled || !employeeId || !date) return;
    let cancelled = false;
    let handled = false;

    let seen: string | null = null;

    const tick = async () => {
      if (cancelled || handled) return;
      try {
        const res = await api.attendance.getRegularizations({ employeeId });
        if (!res.success || !Array.isArray(res.data) || cancelled || handled) return;
        const status = latestWfhRegularizationStatus(res.data, date);
        // The first read is a baseline. A rejection that already existed must not
        // close a punch-in the employee just started.
        if (seen === null) {
          seen = status;
          return;
        }
        if (status === 'rejected' && seen !== 'rejected') {
          handled = true;
          onRejectedRef.current();
        }
        seen = status;
      } catch {
        // The next interval retries.
      }
    };

    void tick();
    const id = window.setInterval(tick, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, employeeId, date]);
}
