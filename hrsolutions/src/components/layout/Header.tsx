'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPersona, NotificationItem } from '@/types';
import { useApp } from '@/context/AppContext';
import { UserAvatar } from '@/components/common/UserAvatar';
import { OrgBrandMark } from '@/components/common/PixbeBrand';
import { GoogleIcon } from '@/components/ui/GoogleIcon';
import { isInstitutionMode } from '@/utils/organizationMode';
import { compressAvatarImage } from '@/utils/imageUtils';
import { saveStoredState } from '@/services/store';
import { api } from '@/services/apiClient';


interface HeaderProps {
  currentPersona: UserPersona;
  onSelectPersona: (persona: UserPersona) => void;
  onOpenCommandPalette: () => void;
  onOpenAIAssistant: () => void;
  onOpenQuickTimer?: () => void;
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead?: () => void;
  onClearReadNotifications?: () => void;
  onNavigateModule?: (module: string) => void;
  onToggleMobileSidebar: () => void;
  themeMode?: 'light' | 'dark';
  onToggleThemeMode?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentPersona,
  onSelectPersona,
  onOpenCommandPalette,
  onOpenAIAssistant,
  onOpenQuickTimer,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearReadNotifications,
  onNavigateModule,
  onToggleMobileSidebar,
}) => {
  const router = useRouter();
  const { state, updateState, triggerToast, logout, deleteNotification, clearAllNotifications } = useApp();
  const [showPersonaMenu, setShowPersonaMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'approvals' | 'tasks'>('all');
  const [modKey, setModKey] = useState('Ctrl');

  useEffect(() => {
    const platform = navigator.platform || '';
    const ua = navigator.userAgent || '';
    const isApple = /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(ua);
    setModKey(isApple ? '⌘' : 'Ctrl');
  }, []);
  const menuRef = useRef<HTMLDivElement>(null);
  const headerFileInputRef = useRef<HTMLInputElement>(null);

  const handleHeaderAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await compressAvatarImage(file);
      if (!dataUrl) return;

      updateState((prev) => {
        const updatedPersona = {
          ...prev.currentPersona,
          avatar: dataUrl,
        };

        const updatedEmployees = (prev.employees || []).map((emp) =>
          emp.id === prev.currentPersona?.id ||
          (emp.email && emp.email.toLowerCase() === (prev.currentPersona?.email || '').toLowerCase()) ||
          emp.name === prev.currentPersona?.name
            ? { ...emp, avatar: dataUrl }
            : emp
        );

        const nextState = {
          ...prev,
          currentPersona: updatedPersona,
          employees: updatedEmployees,
        };

        saveStoredState(nextState);
        return nextState;
      });

      triggerToast({
        title: 'Avatar Updated',
        message: 'Your profile photo has been updated successfully.',
        type: 'system',
      });

      if (currentPersona.id) {
        api.identity.updateEmployee(currentPersona.id, { avatar: dataUrl }).catch((err) => {
          console.warn('Backend API employee avatar update warning:', err);
        });
      }
    } catch (err) {
      console.error('Failed to upload profile photo:', err);
    }
  };

  // Clean notifications list (exclude unnecessary system noise/block notices)
  const cleanNotifications = (notifications || []).filter((n) => {
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

  const unreadCount = cleanNotifications.filter((n) => !n.read).length;

  // Filtered notifications
  const filteredNotifications = cleanNotifications.filter((n) => {
    if (notifFilter === 'unread') return !n.read;
    if (notifFilter === 'approvals') {
      return n.category === 'Approvals' || n.category === 'HR';
    }
    if (notifFilter === 'tasks') return n.category === 'Tasks';
    return true;
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPersonaMenu(false);
        setShowNotifMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationNavigate = (n: NotificationItem) => {
    onMarkNotificationRead(n.id);
    setShowNotifMenu(false);
    if (n.linkUrl) {
      router.push(n.linkUrl);
      return;
    }
    if (n.linkModule) {
      const query = n.linkTab ? `?tab=${n.linkTab}` : '';
      if (onNavigateModule) {
        onNavigateModule(n.linkModule.toLowerCase());
      } else {
        const path = n.linkModule === 'dashboard' ? '/dashboard' : `/${n.linkModule.toLowerCase()}`;
        router.push(`${path}${query}`);
      }
    }
  };

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onMarkAllNotificationsRead) {
      onMarkAllNotificationsRead();
    } else {
      cleanNotifications.forEach((n) => onMarkNotificationRead(n.id));
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clearAllNotifications) {
      clearAllNotifications();
    } else if (onClearReadNotifications) {
      onClearReadNotifications();
    }
  };

  const handleDeleteNotif = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deleteNotification) {
      deleteNotification(id);
    } else {
      onMarkNotificationRead(id);
    }
  };

  const roleDisplay =
    currentPersona?.role === 'super_admin'
      ? 'Admin'
      : currentPersona?.role === 'hr_manager'
      ? 'HR Manager'
      : currentPersona?.role === 'project_manager'
      ? 'Manager'
      : currentPersona?.designation || 'User';

  const isStudent = currentPersona?.role === 'student';
  const isInstitution = isInstitutionMode(state.organization, currentPersona);

  const resolvedAvatar = (() => {
    if (currentPersona?.avatar) return currentPersona.avatar;
    const id = currentPersona?.id;
    const email = (currentPersona?.email || '').toLowerCase();
    const match = (state.employees || []).find(
      (emp) =>
        (id && emp.id === id) ||
        (email && emp.email?.toLowerCase() === email) ||
        emp.name === currentPersona?.name
    );
    return match?.avatar || '';
  })();

  const displayOrgName =
    state.organization?.name &&
    state.organization.name !== 'Corporate Headquarters' &&
    state.organization.name !== 'Office Location'
      ? state.organization.name
      : (isInstitution ? 'Kite Institute of Aviation' : 'Pixbe Workspace');

  return (
    <header className="pixbe-header sticky top-0 z-30 flex h-14 items-center justify-between border-b px-5 lg:px-6 shrink-0 gap-3">
      {/* Left: Institute / School Name Capsule Selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="rounded-[7px] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)] lg:hidden shrink-0 transition-colors cursor-pointer"
          title="Toggle Menu"
        >
          <GoogleIcon name="menu" size={20} />
        </button>

        {/* Organization / School Pill Badge */}
        <div className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-[8px] border border-[var(--border-color)] bg-[var(--bg-surface)] select-none">
          <OrgBrandMark src={state.organization?.logo} />
          <span className="text-[13px] font-semibold text-[var(--text-primary)] tracking-tight truncate max-w-[200px] sm:max-w-[320px]">
            {displayOrgName}
          </span>
        </div>
      </div>

      {/* Right Controls: Search anything, Notifications, Profile */}
      <div ref={menuRef} className="flex items-center flex-wrap sm:flex-nowrap gap-3 shrink-0">
        {/* Search Pill */}
        <button
          type="button"
          onClick={onOpenCommandPalette}
          className="relative hidden sm:flex items-center h-9 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-[7px] px-3 w-56 md:w-64 transition-[border-color] duration-150 cursor-pointer hover:border-[var(--border-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary-blue)] focus-visible:outline-offset-2"
          aria-label="Search anything"
        >
          <GoogleIcon name="search" size={16} className="text-[var(--text-muted)] shrink-0 mr-2.5" />
          <span className="flex-1 text-left text-[13px] text-[var(--text-muted)] truncate">
            Search anything
          </span>
          <kbd className="inline-flex items-center gap-0.5 text-[10px] font-mono font-medium text-[var(--text-muted)] bg-[var(--bg-surface-subtle)] px-1.5 py-0.5 rounded-[5px] border border-[var(--border-color)]">
            <span>{modKey}</span>
            <span>K</span>
          </kbd>
        </button>

        {/* Global Notifications Bell */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              setShowNotifMenu(prev => !prev);
              setShowPersonaMenu(false);
            }}
            className="relative p-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-[color,background-color] duration-150 cursor-pointer flex items-center justify-center"
            title="Notifications"
          >
            <GoogleIcon name="notifications" size={19} weight={500} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showNotifMenu && (
            <div
              className="absolute right-0 mt-2 w-80 sm:w-96 rounded-[12px] border border-[var(--border-color)] bg-[var(--bg-surface)] z-50 overflow-hidden animate-in fade-in zoom-in-95"
              style={{ boxShadow: '0 5px 15px rgba(26,46,62,.06)' }}
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--border-color)]">
                <h3 className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
                  Notifications
                  {unreadCount > 0 ? (
                    <span className="ml-2 text-[12px] font-semibold text-[var(--text-muted)]">
                      {unreadCount} unread
                    </span>
                  ) : null}
                </h3>
                <div className="flex items-center gap-3 shrink-0">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-[12px] font-semibold text-[var(--primary-blue)] hover:text-[var(--primary-blue-hover,#285275)] cursor-pointer"
                    >
                      Mark read
                    </button>
                  )}
                  {cleanNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[12px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                      title="Clear all notifications"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 px-4 pt-3 overflow-x-auto custom-scrollbar">
                {(['all', 'unread', 'tasks', 'approvals'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setNotifFilter(filter)}
                    className={`h-7 px-2.5 rounded-[7px] text-[12px] font-semibold capitalize whitespace-nowrap transition-colors cursor-pointer ${
                      notifFilter === filter
                        ? 'bg-[var(--primary-navy,#17324e)] text-white'
                        : 'bg-[var(--bg-surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-color)]'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              <div className="max-h-80 overflow-y-auto mt-2 px-2 pb-2 custom-scrollbar">
                {filteredNotifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <p className="text-[13px] font-medium text-[var(--text-secondary)]">No notifications</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-color)]">
                    {filteredNotifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationNavigate(n)}
                        className={`px-2.5 py-3 rounded-[8px] cursor-pointer relative group transition-colors ${
                          !n.read
                            ? 'bg-[var(--blue-selected,#f8fbfe)] hover:bg-[var(--blue-focus,#d8e8f2)]/40'
                            : 'hover:bg-[var(--bg-surface-subtle)]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                              !n.read ? 'bg-[var(--primary-blue,#2d628e)]' : 'bg-transparent'
                            }`}
                            aria-hidden
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p
                                className={`text-[13px] leading-snug truncate ${
                                  !n.read
                                    ? 'font-semibold text-[var(--text-primary)]'
                                    : 'font-medium text-[var(--text-secondary)]'
                                }`}
                              >
                                {n.title}
                              </p>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteNotif(n.id, e)}
                                className="opacity-0 group-hover:opacity-100 h-7 w-7 flex items-center justify-center rounded-[7px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-subtle)] transition-opacity cursor-pointer shrink-0"
                                title="Dismiss"
                                aria-label="Dismiss notification"
                              >
                                <GoogleIcon name="close" size={14} />
                              </button>
                            </div>
                            {n.message ? (
                              <p className="text-[12px] text-[var(--text-muted)] mt-0.5 line-clamp-2 leading-relaxed">
                                {n.message}
                              </p>
                            ) : null}
                            <div className="flex items-center justify-between gap-2 mt-1.5">
                              <span className="text-[12px] text-[var(--text-muted)] tabular-nums">
                                {n.timestamp}
                              </span>
                              {n.category ? (
                                <span className="text-[12px] text-[var(--text-muted)] truncate">
                                  {n.category}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border-color)] px-4 py-2.5">
                <Link
                  href="/notifications"
                  onClick={() => setShowNotifMenu(false)}
                  className="text-[12px] font-semibold text-[var(--primary-blue,#2d628e)] hover:text-[var(--primary-navy,#17324e)]"
                >
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill & Dropdown */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              setShowPersonaMenu(prev => !prev);
              setShowNotifMenu(false);
            }}
            className="flex items-center gap-2.5 pl-1.5 py-1 pr-2 rounded-xl hover:bg-slate-50 dark:hover:bg-[#1e1e24] transition cursor-pointer"
            title={`${currentPersona.name} (${roleDisplay})`}
          >
            <UserAvatar
              src={resolvedAvatar}
              name={currentPersona.name}
              className="w-9 h-9 ring-1.5 ring-slate-200 hover:ring-blue-500 shadow-xs"
            />
            <div className="flex flex-col text-left hidden sm:flex">
              <span className="text-xs font-bold text-[#0f172a] dark:text-white leading-tight">
                {currentPersona.name}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                {roleDisplay}
              </span>
            </div>
          </button>

          {showPersonaMenu && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] p-4 shadow-lg ring-1 ring-slate-900/5 dark:ring-black/50 z-50 space-y-3 text-[var(--text-primary)] animate-in fade-in zoom-in-95">
              {/* Profile Header Card */}
              <div className="flex items-start gap-3.5 pb-4 border-b border-slate-100 dark:border-[#282830]">
                <div
                  className="relative shrink-0 group cursor-pointer"
                  onClick={() => headerFileInputRef.current?.click()}
                  title="Upload profile photo"
                >
                  <UserAvatar
                    src={resolvedAvatar}
                    name={currentPersona.name}
                    className="h-14 w-14 ring-2 ring-slate-200 dark:ring-white/20 text-sm"
                  />
                  <input
                    type="file"
                    ref={headerFileInputRef}
                    onChange={handleHeaderAvatarUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#1c1c20]" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{currentPersona.name}</h3>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-[#9e9ea7] font-semibold truncate">
                    {currentPersona.designation}
                  </p>

                  <p className="text-[11px] text-slate-400 dark:text-[#9e9ea7] flex items-center gap-1.5 truncate">
                    <GoogleIcon name="mail" size={13} className="text-slate-400 shrink-0" />
                    <span className="truncate">{currentPersona.email}</span>
                  </p>
                </div>
              </div>

              {!isStudent && (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <button
                    onClick={() => {
                      router.push('/timesheets');
                      setShowPersonaMenu(false);
                    }}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#161619] dark:hover:bg-[#242429] text-slate-600 dark:text-[#9e9ea7] hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#282830] transition-all cursor-pointer"
                  >
                    <GoogleIcon name="timer" size={18} />
                    <span className="text-[10px] font-bold">Timesheets</span>
                  </button>
                  <button
                    onClick={() => {
                      router.push('/attendance');
                      setShowPersonaMenu(false);
                    }}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#161619] dark:hover:bg-[#242429] text-slate-600 dark:text-[#9e9ea7] hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#282830] transition-all cursor-pointer"
                  >
                    <GoogleIcon name="schedule" size={18} />
                    <span className="text-[10px] font-bold">Attendance</span>
                  </button>
                  <button
                    onClick={() => {
                      router.push('/projects');
                      setShowPersonaMenu(false);
                    }}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#161619] dark:hover:bg-[#242429] text-slate-600 dark:text-[#9e9ea7] hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#282830] transition-all cursor-pointer"
                  >
                    <GoogleIcon name="folder_open" size={18} />
                    <span className="text-[10px] font-bold">Projects</span>
                  </button>
                </div>
              )}

              {/* Sign Out Action */}
              <div className="pt-2 border-t border-slate-100 dark:border-[#282830]">
                <button
                  onClick={() => {
                    setShowPersonaMenu(false);
                    logout();
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 transition-all cursor-pointer font-bold text-xs flex items-center justify-center gap-2"
                >
                  <GoogleIcon name="logout" size={16} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

