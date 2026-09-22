'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPersona, NotificationItem } from '@/types';
import { useApp } from '@/context/AppContext';
import { UserAvatar } from '@/components/common/UserAvatar';
import { KiteLogoMark } from '@/components/common/KiteLogoMark';
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
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread' | 'approvals' | 'tasks' | 'attendance'>('all');
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
    if (titleLower.includes('action blocked') || titleLower.includes('demo workspace')) return false;
    return true;
  });

  const unreadCount = cleanNotifications.filter((n) => !n.read).length;

  // Filtered notifications
  const filteredNotifications = cleanNotifications.filter((n) => {
    if (notifFilter === 'unread') return !n.read;
    if (notifFilter === 'approvals') return n.category === 'Approvals' || n.category === 'HR';
    if (notifFilter === 'tasks') return n.category === 'Tasks';
    if (notifFilter === 'attendance') return n.category === 'Attendance';
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-transparent backdrop-blur-md border-b border-slate-200/50 dark:border-white/5 px-6 lg:px-8 shrink-0 gap-4 transition-colors">
      {/* Left: Institute / School Name Capsule Selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileSidebar}
          className="rounded-xl p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-[#9e9ea7] dark:hover:bg-white/[0.06] lg:hidden shrink-0 transition-colors cursor-pointer"
          title="Toggle Menu"
        >
          <GoogleIcon name="menu" size={20} />
        </button>

        {/* Organization / School Pill Badge */}
        <div className="inline-flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-full border border-slate-200/90 dark:border-[#282830] bg-white dark:bg-[#161619] shadow-xs select-none">
          {/* Design Theme Blue Circular Icon */}
          <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <KiteLogoMark className="w-3.5 h-3.5 text-white" />
          </div>

          {/* Institution / Workspace Name */}
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tracking-tight truncate max-w-[200px] sm:max-w-[320px]">
            {displayOrgName}
          </span>
        </div>
      </div>

      {/* Right Controls: Search anything, Notifications, Profile */}
      <div ref={menuRef} className="flex items-center flex-wrap sm:flex-nowrap gap-3 shrink-0">
        {/* Search Pill */}
        <div
          onClick={onOpenCommandPalette}
          className="relative hidden sm:flex items-center bg-white dark:bg-[#161619] border border-slate-200 dark:border-[#282830] rounded-xl px-3.5 py-2 w-64 md:w-72 shadow-xs transition focus-within:border-[#2563eb] cursor-pointer hover:border-slate-300"
        >
          <GoogleIcon name="search" size={16} className="text-slate-400 shrink-0 mr-2.5" />
          <input
            type="text"
            placeholder="Search anything"
            readOnly
            className="w-full bg-transparent border-0 p-0 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:ring-0 focus:outline-none cursor-pointer"
          />
          <div className="flex items-center gap-0.5 text-[10px] font-mono font-medium text-slate-400 bg-slate-100 dark:bg-[#202024] px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#282830]">
            <span>⌘</span>
            <span>K</span>
          </div>
        </div>

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
            className="relative p-2.5 rounded-xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#161619] text-slate-600 dark:text-[#9e9ea7] hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#1e1e24] transition cursor-pointer shadow-xs flex items-center justify-center"
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
            <div className="absolute right-0 mt-3 w-80 sm:w-96 rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#1c1c20] p-4 shadow-xl ring-1 ring-slate-900/5 dark:ring-black/50 z-50 space-y-3 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#282830]">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 cursor-pointer inline-flex items-center gap-1"
                    >
                      <GoogleIcon name="done_all" size={14} />
                      <span>Mark read</span>
                    </button>
                  )}
                  {cleanNotifications.length > 0 && (
                    <button
                      onClick={handleClearAll}
                      className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer inline-flex items-center gap-1"
                      title="Clear all notifications"
                    >
                      <GoogleIcon name="delete_sweep" size={14} />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Notification Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                {(['all', 'unread', 'approvals', 'tasks', 'attendance'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setNotifFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold capitalize whitespace-nowrap transition-all cursor-pointer ${
                      notifFilter === filter
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-[#202024] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#282830]'
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Notifications List */}
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {filteredNotifications.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 dark:text-slate-500 text-xs space-y-1">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-[#242429] flex items-center justify-center mx-auto text-slate-400">
                      <GoogleIcon name="notifications_off" size={18} />
                    </div>
                    <p className="font-medium mt-1">No notifications</p>
                  </div>
                ) : (
                  filteredNotifications.map((n) => {
                    const badge = getCategoryBadge(n.category);
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationNavigate(n)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${
                          !n.read
                            ? 'bg-blue-50/40 dark:bg-blue-950/20 border-blue-100/90 dark:border-blue-900/40 hover:bg-blue-50/70 dark:hover:bg-blue-950/30'
                            : 'bg-slate-50/50 dark:bg-[#161619]/60 border-slate-100 dark:border-[#282830] hover:bg-slate-100/70 dark:hover:bg-[#202024]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${badge.bg}`}
                          >
                            <GoogleIcon name={badge.iconName} size={17} weight={500} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1.5">
                              <p className={`text-xs font-bold leading-snug truncate ${!n.read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                {n.title}
                              </p>
                              <div className="flex items-center gap-1 shrink-0">
                                {!n.read && (
                                  <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteNotif(n.id, e)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-[#2c2c34] text-slate-400 hover:text-slate-700 dark:hover:text-white transition-opacity"
                                  title="Dismiss notification"
                                >
                                  <GoogleIcon name="close" size={13} />
                                </button>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2 leading-relaxed font-normal">
                              {n.message}
                            </p>
                            <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                              <GoogleIcon name="schedule" size={11} className="opacity-70" />
                              <span>{n.timestamp}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
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
            <div className="absolute right-0 mt-3 w-80 rounded-2xl border border-slate-200 dark:border-[#282830] bg-white dark:bg-[#1c1c20] p-5 shadow-xl ring-1 ring-slate-900/5 dark:ring-black/50 z-50 space-y-4 text-slate-900 dark:text-white animate-in fade-in zoom-in-95">
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

