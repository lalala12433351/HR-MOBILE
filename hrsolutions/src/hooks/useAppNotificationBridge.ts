'use client';

import { useEffect, useRef } from 'react';
import type { NotificationItem } from '@/types';
import { seedSeenNotificationIds, showAppNotification } from '@/lib/native';

function linkForNotification(item: NotificationItem): string {
  if (item.linkUrl && item.linkUrl.startsWith('/')) return item.linkUrl;
  if (item.linkModule) {
    const tab = item.linkTab ? `?tab=${encodeURIComponent(item.linkTab)}` : '';
    return `/${item.linkModule.toLowerCase()}${tab}`;
  }
  return '/notifications';
}

/**
 * Watches the inbox and fires OS / browser notifications for newly arrived unread items.
 * Seeds seen ids after the first backend hydrate so historical rows do not spam the tray.
 */
export function useAppNotificationBridge(
  notifications: NotificationItem[] | undefined,
  ready: boolean,
  inboxHydrated: boolean,
) {
  const seededRef = useRef(false);

  useEffect(() => {
    if (!ready) {
      seededRef.current = false;
      return;
    }
    if (!inboxHydrated) return;

    const list = notifications || [];

    if (!seededRef.current) {
      seedSeenNotificationIds(list.map((n) => n.id).filter(Boolean));
      seededRef.current = true;
      return;
    }

    for (const item of list) {
      if (!item?.id || item.read) continue;
      void showAppNotification(
        {
          id: item.id,
          title: item.title,
          body: item.message || item.title,
          linkUrl: linkForNotification(item),
        },
        { force: true },
      );
    }
  }, [notifications, ready, inboxHydrated]);
}
