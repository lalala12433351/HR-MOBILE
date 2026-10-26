'use client';

import { api } from '../../services/apiClient';
import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppState } from '../../services/store';
import { NotificationItem } from '../../types';
import { GoogleIcon } from '../ui/GoogleIcon';
import { SlideOverDrawer, slideOverBodyClass, slideOverFooterClass, slideOverPrimaryClass } from '@/components/common/SlideOverDrawer';
import { disableDesktopPush, enableDesktopPush, pushPreferenceEnabled } from '@/services/desktopPush';
import {
  getAppNotificationPermission,
  getAppNotificationsEnabled,
  isNativePlatform,
  requestAppNotificationPermission,
  setAppNotificationsEnabled,
} from '@/lib/native';

interface NotificationsModuleProps {
  state: AppState;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  onNavigateModule?: (module: string) => void;
}

type NotifTab = 'all' | 'unread' | 'tasks' | 'approvals';

export const NotificationsModule: React.FC<NotificationsModuleProps> = ({
  state,
  onUpdateState,
  onNavigateModule,
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NotifTab>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!showSettings) return;
    let cancelled = false;
    void (async () => {
      if (isNativePlatform()) {
        const permission = await getAppNotificationPermission();
        if (cancelled) return;
        setPushEnabled(getAppNotificationsEnabled() && permission === 'granted');
        setPushStatus(null);
        return;
      }
      const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      if (cancelled) return;
      setPushEnabled(pushPreferenceEnabled() && granted);
      setPushStatus(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [showSettings]);

  const onPushChange = async (checked: boolean) => {
    setPushBusy(true);
    setPushStatus(null);
    if (isNativePlatform()) {
      if (checked) {
        const granted = await requestAppNotificationPermission();
        setPushEnabled(granted);
        if (!granted) {
          setPushStatus('Notification permission was denied. You can enable it in your device settings.');
        }
      } else {
        setAppNotificationsEnabled(false);
        setPushEnabled(false);
      }
      setPushBusy(false);
      return;
    }
    if (checked) {
      const result = await enableDesktopPush();
      setPushEnabled(result.ok);
      if (!result.ok) setPushStatus(result.reason || 'Desktop alerts could not be turned on.');
    } else {
      await disableDesktopPush();
      setPushEnabled(false);
    }
    setPushBusy(false);
  };

  const allNotifications: NotificationItem[] = useMemo(() => {
    return (state.notifications || []).filter((n) => {
      if (!n || !n.title) return false;
      const titleLower = n.title.toLowerCase();
      if (
        titleLower.includes('action blocked') ||
        titleLower.includes('demo workspace') ||
        titleLower.includes('workspace ready') ||
        titleLower.includes('backend notice') ||
        titleLower.includes('profile was updated')
      ) {
        return false;
      }
      return true;
    });
  }, [state.notifications]);

  const unreadCount = allNotifications.filter((n) => !n.read).length;

  const handleMarkRead = async (id: string) => {
    if (onUpdateState) {
      setIsSaving(true);
      try {
        await api.auditComms.markNotificationRead(id);
        onUpdateState((prev) => ({
          ...prev,
          notifications: (prev.notifications || []).map((n) => (n.id === id ? { ...n, read: true } : n)),
        }));
      } catch (err) {
        console.error('Failed to mark notification read', err);
        alert('Failed to mark notification as read.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (onUpdateState) {
      setIsSaving(true);
      try {
        await api.auditComms.markAllNotificationsRead(state.currentPersona.id);
        onUpdateState((prev) => ({
          ...prev,
          notifications: (prev.notifications || []).map((n) => ({ ...n, read: true })),
        }));
      } catch (err) {
        console.error('Failed to mark all notifications read', err);
        alert('Failed to mark all notifications as read.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDeleteNotif = async (id: string) => {
    if (onUpdateState) {
      setIsSaving(true);
      try {
        await api.auditComms.deleteNotification(id);
        onUpdateState((prev) => ({
          ...prev,
          notifications: (prev.notifications || []).filter((n) => n.id !== id),
        }));
      } catch (err) {
        console.error('Failed to delete notification', err);
        alert('Failed to delete notification.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleClearAll = async () => {
    if (onUpdateState) {
      setIsSaving(true);
      try {
        await api.auditComms.clearAllNotifications(state.currentPersona.id);
        onUpdateState((prev) => ({
          ...prev,
          notifications: [],
        }));
      } catch (err) {
        console.error('Failed to clear notifications', err);
        alert('Failed to clear notifications.');
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleNavigate = (item: NotificationItem) => {
    handleMarkRead(item.id);
    if (item.linkUrl) {
      router.push(item.linkUrl);
      return;
    }
    if (item.linkModule) {
      const query = item.linkTab ? `?tab=${item.linkTab}` : '';
      if (onNavigateModule) {
        onNavigateModule(item.linkModule.toLowerCase());
      } else {
        const path = item.linkModule === 'dashboard' ? '/dashboard' : `/${item.linkModule.toLowerCase()}`;
        router.push(`${path}${query}`);
      }
    }
  };

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') return allNotifications.filter((n) => !n.read);
    if (activeTab === 'tasks') return allNotifications.filter((n) => n.category === 'Tasks');
    if (activeTab === 'approvals') {
      return allNotifications.filter(
        (n) => n.category === 'Approvals' || n.category === 'HR' || n.category === 'Finance'
      );
    }
    return allNotifications;
  }, [allNotifications, activeTab]);

  const tabs: { key: NotifTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'tasks', label: 'Tasks' },
    { key: 'approvals', label: 'Approvals' },
  ];

  return (
    <div className="notifications-page w-full max-w-3xl mx-auto space-y-5 font-sans text-[var(--text-primary)] animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <h1
          className="font-bold tracking-tight text-[var(--text-primary)]"
          style={{ fontSize: 'clamp(16px, 1.5vw, 20px)', letterSpacing: '-.02em' }}
        >
          Notifications
          {unreadCount > 0 ? (
            <span className="ml-2 text-[13px] font-semibold text-[var(--text-muted)]">
              {unreadCount} unread
            </span>
          ) : null}
        </h1>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={isSaving}
              className="h-9 px-3.5 rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[12px] font-semibold text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              Mark all read
            </button>
          )}

          {allNotifications.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={isSaving}
              className="h-9 px-3.5 rounded-[7px] border border-[var(--border-color)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-subtle)] text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              Clear all
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="h-9 w-9 rounded-[7px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] border border-transparent hover:border-[var(--border-color)] transition-colors cursor-pointer flex items-center justify-center"
            title="Settings"
            aria-label="Notification settings"
          >
            <GoogleIcon name="tune" size={18} />
          </button>
        </div>
      </div>

      <div className="rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-surface)] overflow-hidden">
        <div className="border-b border-[var(--border-color)] px-4 sm:px-5 pt-3 flex items-center gap-6 text-[13px] font-semibold overflow-x-auto scrollbar-none">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 relative transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab.key
                  ? 'text-[var(--text-primary)] border-b-2 border-[var(--primary-navy,#17324e)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="divide-y divide-[var(--border-color)]">
          {filteredNotifications.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-[13px] font-medium text-[var(--text-secondary)]">No notifications</p>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const isUnread = !item.read;

              return (
                <div
                  key={item.id}
                  onClick={() => handleNavigate(item)}
                  className={`px-4 sm:px-5 py-3.5 flex items-start gap-3 group cursor-pointer transition-colors ${
                    isUnread
                      ? 'bg-[var(--blue-selected,#f8fbfe)] hover:bg-[var(--blue-focus,#d8e8f2)]/35'
                      : 'hover:bg-[var(--bg-surface-subtle)]'
                  }`}
                >
                  <span
                    className={`mt-2 h-1.5 w-1.5 rounded-full shrink-0 ${
                      isUnread ? 'bg-[var(--primary-blue,#2d628e)]' : 'bg-transparent'
                    }`}
                    aria-hidden
                  />

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                      <span
                        className={`text-[13px] tracking-tight leading-snug ${
                          isUnread
                            ? 'font-semibold text-[var(--text-primary)]'
                            : 'font-medium text-[var(--text-secondary)]'
                        }`}
                      >
                        {item.title}
                      </span>
                      <span className="text-[12px] text-[var(--text-muted)] tabular-nums shrink-0">
                        {item.timestamp}
                      </span>
                    </div>

                    {item.message ? (
                      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed line-clamp-2">
                        {item.actorName ? (
                          <strong className="font-semibold text-[var(--text-primary)]">{item.actorName} </strong>
                        ) : null}
                        {item.message}
                      </p>
                    ) : null}

                    {item.category ? (
                      <p className="text-[12px] text-[var(--text-muted)]">{item.category}</p>
                    ) : null}
                  </div>

                  <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(item.id);
                        }}
                        className="h-9 w-9 rounded-[7px] text-[var(--text-muted)] hover:text-[var(--primary-blue,#2d628e)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer flex items-center justify-center"
                        title="Mark as read"
                        aria-label="Mark as read"
                      >
                        <GoogleIcon name="check" size={16} />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNotif(item.id);
                      }}
                      className="h-9 w-9 rounded-[7px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-colors cursor-pointer flex items-center justify-center"
                      title="Dismiss"
                      aria-label="Dismiss notification"
                    >
                      <GoogleIcon name="close" size={15} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showSettings && (
        <SlideOverDrawer title="Notification Settings" onClose={() => setShowSettings(false)}>
          <div className={`${slideOverBodyClass} text-[var(--text-secondary)] space-y-3`}>
            <label className="flex items-center justify-between p-3 rounded-[9px] bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] cursor-pointer">
              <div>
                <p className="font-semibold text-[13px] text-[var(--text-primary)]">Push notifications</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Alerts arrive even when Pixbe is closed</p>
                {pushStatus && <p className="text-[12px] text-[#8b3133] dark:text-red-300 mt-1">{pushStatus}</p>}
              </div>
              <input
                type="checkbox"
                checked={pushEnabled}
                disabled={pushBusy}
                onChange={(e) => void onPushChange(e.target.checked)}
                className="h-4 w-4 rounded accent-[var(--primary-navy,#17324e)] cursor-pointer disabled:opacity-50"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-[9px] bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] cursor-pointer">
              <div>
                <p className="font-semibold text-[13px] text-[var(--text-primary)]">Approvals and requests</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Leave and HR desk updates</p>
              </div>
              <input
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded accent-[var(--primary-navy,#17324e)] cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-[9px] bg-[var(--bg-surface-subtle)] border border-[var(--border-color)] cursor-pointer">
              <div>
                <p className="font-semibold text-[13px] text-[var(--text-primary)]">Task emails</p>
                <p className="text-[12px] text-[var(--text-muted)] mt-0.5">Assigned to you and deadline reminders</p>
              </div>
              <input
                type="checkbox"
                defaultChecked
                className="h-4 w-4 rounded accent-[var(--primary-navy,#17324e)] cursor-pointer"
              />
            </label>
          </div>

          <div className={slideOverFooterClass}>
            <button type="button" onClick={() => setShowSettings(false)} className={slideOverPrimaryClass}>
              Done
            </button>
          </div>
        </SlideOverDrawer>
      )}
    </div>
  );
};
