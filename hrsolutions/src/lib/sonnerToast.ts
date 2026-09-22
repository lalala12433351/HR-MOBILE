import { toast } from 'sonner';
import type { RealtimeToast } from '@/types';

type ToastInput = Omit<RealtimeToast, 'id' | 'timestamp'> & {
  id: string;
  timestamp: string;
};

function hasOpenTarget(t: ToastInput): boolean {
  return Boolean(
    t.linkModule ||
      t.type === 'task' ||
      t.type === 'attendance' ||
      t.type === 'approval' ||
      t.type === 'hr' ||
      t.type === 'message' ||
      t.type === 'meeting' ||
      t.type === 'announcement'
  );
}

/**
 * Maps RealtimeToast payloads onto Sonner recipes (success / error / info / warning / default).
 */
export function showRealtimeToast(
  payload: ToastInput,
  onOpen?: (toast: ToastInput) => void
): string | number {
  const duration =
    payload.priority === 'urgent' ? 9000 : payload.priority === 'high' ? 7000 : 5000;

  const options = {
    id: payload.id,
    description: payload.message,
    duration,
    action:
      onOpen && hasOpenTarget(payload)
        ? {
            label: 'Open',
            onClick: () => onOpen(payload),
          }
        : undefined,
  };

  switch (payload.type) {
    case 'finance':
    case 'announcement':
      return toast.success(payload.title, options);
    case 'approval':
    case 'task':
    case 'meeting':
      return toast.info(payload.title, options);
    case 'attendance':
    case 'hr':
      return toast(payload.title, options);
    case 'message':
      return toast(payload.title, options);
    default:
      if (payload.priority === 'urgent' || payload.priority === 'high') {
        return toast.warning(payload.title, options);
      }
      return toast(payload.title, options);
  }
}

export function dismissRealtimeToast(id?: string) {
  if (id) toast.dismiss(id);
  else toast.dismiss();
}
