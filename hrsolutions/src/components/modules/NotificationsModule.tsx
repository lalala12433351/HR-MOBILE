'use client';

import { api } from '../../services/apiClient';
import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppState } from '../../services/store';
import { NotificationItem } from '../../types';
import { GoogleIcon } from '../ui/GoogleIcon';
import { SlideOverDrawer, slideOverBodyClass, slideOverFooterClass, slideOverPrimaryClass } from '@/components/common/SlideOverDrawer';

interface NotificationsModuleProps {
  state: AppState;
  onUpdateState?: (updater: (prev: AppState) => AppState) => void;
  onNavigateModule?: (module: string) => void;
}

export const NotificationsModule: React.FC<NotificationsModuleProps> = ({
  state,
  onUpdateState,
  onNavigateModule,
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'shared' | 'comments' | 'approvals'>('overview');
  const [showPushBanner, setShowPushBanner] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Directly derive clean notifications from live state.notifications
  const allNotifications: NotificationItem[] = useMemo(() => {
    return (state.notifications || []).filter((n) => {
      if (!n || !n.title) return false;
      const titleLower = n.title.toLowerCase();
      if (titleLower.includes('action blocked') || titleLower.includes('demo workspace')) return false;
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

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'Attendance':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40',
          iconName: 'schedule',
        };
      case 'Approvals':
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40',
          iconName: 'verified_user',
        };
      case 'Tasks':
        return {
          bg: 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40',
          iconName: 'assignment',
        };
      case 'HR':
        return {
          bg: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/40',
          iconName: 'badge',
        };
      case 'Finance':
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40',
          iconName: 'payments',
        };
      case 'Meetings':
        return {
          bg: 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-900/40',
          iconName: 'forum',
        };
      default:
        return {
          bg: 'bg-slate-100 dark:bg-[#202024] text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-[#282830]',
          iconName: 'notifications',
        };
    }
  };

  // Filter notifications by active tab
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'overview') return allNotifications;
    if (activeTab === 'shared') {
      return allNotifications.filter(
        (n) =>
          n.linkModule === 'documents' ||
          n.category === 'HR' ||
          n.title.toLowerCase().includes('shared') ||
          n.title.toLowerCase().includes('document')
      );
    }
    if (activeTab === 'comments') {
      return allNotifications.filter(
        (n) =>
          n.category === 'CRM' ||
          n.category === 'Meetings' ||
          n.title.toLowerCase().includes('comment') ||
          n.title.toLowerCase().includes('reaction')
      );
    }
    if (activeTab === 'approvals') {
      return allNotifications.filter(
        (n) =>
          n.category === 'Approvals' ||
          n.category === 'Finance' ||
          n.linkTab === 'leaves' ||
          n.linkTab === 'regularizations' ||
          n.linkTab === 'expenses' ||
          n.title.toLowerCase().includes('approval') ||
          n.title.toLowerCase().includes('leave') ||
          n.title.toLowerCase().includes('claim')
      );
    }
    return allNotifications;
  }, [allNotifications, activeTab]);

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 font-sans text-slate-900 animate-fade-in">
      {/* Top Push Notification Banner */}
      {showPushBanner && !pushEnabled && (
        <div className="rounded-2xl bg-indigo-50/70 border border-indigo-100/90 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-800 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <GoogleIcon name="notifications_active" size={18} className="text-indigo-600 shrink-0" />
            <p className="font-normal text-slate-700">
              <strong className="font-bold text-slate-900">Turn on push notifications</strong> to receive instant alerts when items require your attention.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              type="button"
              onClick={() => {
                setPushEnabled(true);
                setShowPushBanner(false);
              }}
              className="px-4 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-indigo-200/90 text-xs font-bold text-slate-900 shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              Allow push notifications
            </button>
            <button
              type="button"
              onClick={() => setShowPushBanner(false)}
              className="px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Notifications
          </h1>
          {unreadCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-xs font-bold text-blue-600">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
            >
              <GoogleIcon name="done_all" size={15} />
              <span>Mark all read</span>
            </button>
          )}

          {allNotifications.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-500 hover:text-slate-800 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
            >
              <GoogleIcon name="delete_sweep" size={15} />
              <span>Clear all</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer flex items-center justify-center"
            title="Settings"
          >
            <GoogleIcon name="tune" size={18} />
          </button>
        </div>
      </div>

      {/* Main Card Container */}
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-2xs overflow-hidden">
        {/* Tabs Bar inside Card */}
        <div className="border-b border-slate-100 px-4 sm:px-6 pt-3.5 flex items-center gap-8 text-sm font-semibold overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-3 relative transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'overview'
                ? 'text-slate-900 font-bold border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Overview
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shared')}
            className={`pb-3 relative transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'shared'
                ? 'text-slate-900 font-bold border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Shared with me
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('comments')}
            className={`pb-3 relative transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'comments'
                ? 'text-slate-900 font-bold border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Comments
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('approvals')}
            className={`pb-3 relative transition-colors whitespace-nowrap cursor-pointer ${
              activeTab === 'approvals'
                ? 'text-slate-900 font-bold border-b-2 border-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Approvals
          </button>
        </div>

        {/* Notifications Stream */}
        <div className="divide-y divide-slate-100 px-3 sm:px-6">
          {filteredNotifications.length === 0 ? (
            <div className="py-24 text-center space-y-2">
              <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto text-slate-400">
                <GoogleIcon name="inbox" size={20} />
              </div>
              <p className="text-xs font-semibold text-slate-500">No notifications in this tab</p>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const isUnread = !item.read;
              const badge = getCategoryBadge(item.category);

              return (
                <div
                  key={item.id}
                  onClick={() => handleNavigate(item)}
                  className={`py-4 flex items-center justify-between gap-4 group cursor-pointer transition-colors px-3 -mx-3 rounded-xl ${
                    isUnread ? 'bg-blue-50/20 hover:bg-blue-50/40' : 'hover:bg-slate-50/80'
                  }`}
                >
                  {/* Category Google Icon */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${badge.bg}`}>
                    <GoogleIcon name={badge.iconName} size={18} weight={500} />
                  </div>

                  {/* Notification Content */}
                  <div className="space-y-1 min-w-0 flex-1">
                    {/* Line 1: Title & Mobile-only timestamp */}
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                      <span className={`text-xs sm:text-sm tracking-tight leading-snug ${isUnread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                        {item.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal sm:hidden shrink-0">
                        {item.timestamp}
                      </span>
                    </div>

                    {/* Line 2: Avatar, Actor, Context */}
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {item.actorAvatar ? (
                        <img
                          src={item.actorAvatar}
                          alt=""
                          className="h-5 w-5 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                        />
                      ) : null}

                      <div className="flex items-center gap-2 truncate">
                        {item.actorName && (
                          <strong className="font-semibold text-slate-900 shrink-0">
                            {item.actorName}
                          </strong>
                        )}
                        <span className="text-slate-500 truncate">{item.message}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Timestamp on desktop & Actions */}
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="hidden sm:inline text-xs text-slate-400 font-normal tabular-nums">
                      {item.timestamp}
                    </span>

                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkRead(item.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-all cursor-pointer"
                        title="Mark as read"
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
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-all cursor-pointer"
                      title="Dismiss"
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

      {/* Settings Modal */}
      {showSettings && (
        <SlideOverDrawer title="Notification Settings" onClose={() => setShowSettings(false)}>
            <div className={`${slideOverBodyClass} text-[var(--text-secondary)]`}>
              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <p className="font-bold text-slate-900">Push Notifications</p>
                  <p className="text-slate-400 font-medium mt-0.5">Receive alerts when active</p>
                </div>
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => setPushEnabled(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <p className="font-bold text-slate-900">Approvals & Requests</p>
                  <p className="text-slate-400 font-medium mt-0.5">Leave applications and regularizations</p>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-100 cursor-pointer">
                <div>
                  <p className="font-bold text-slate-900">Shared Items & Mentions</p>
                  <p className="text-slate-400 font-medium mt-0.5">Documents and task updates</p>
                </div>
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
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

