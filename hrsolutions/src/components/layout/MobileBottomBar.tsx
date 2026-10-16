'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { isInstitutionMode } from '@/utils/organizationMode';
import { PixbeIcon } from '@/components/common/PixbeIcon';
import { useChatUnread } from '@/hooks/useChat';

export function MobileBottomBar() {
  const pathname = usePathname();
  const {
    state,
    currentPersona,
    setAiAssistantOpen,
  } = useApp();

  const isInstitution = isInstitutionMode(state.organization, currentPersona);
  const isStudentRole = currentPersona?.role === 'student';
  const unreadNotifCount = state.notifications?.filter((n) => !n.read).length || 0;
  const chatUnread = useChatUnread();

  const isPathActive = (path: string) => {
    if (!pathname) return false;
    if (path === '/dashboard') return pathname === '/' || pathname === '/dashboard';
    return pathname.startsWith(path);
  };

  const isTimetableActive = isPathActive('/timetable');
  const isAttendanceActive = isStudentRole
    ? isPathActive('/student-attendance')
    : isPathActive('/attendance') || isPathActive('/leaves');
  const isAnnouncementsActive = isPathActive('/announcements');
  const isPeopleActive = isPathActive(isInstitution ? '/student-directory' : '/hr');
  const isProjectsActive = isPathActive('/projects');
  const isHomeActive = isPathActive('/dashboard');
  const isChatActive = isPathActive('/chat');

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="pixbe-mobile-nav fixed bottom-0 inset-x-0 z-30 flex lg:hidden bg-[var(--bg-surface)] dark:bg-[#0f1117] border-t border-[var(--border-color)]/80 shadow-[0_-4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)] select-none transition-colors duration-200"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className={`w-full max-w-md mx-auto grid ${isStudentRole ? 'grid-cols-4' : 'grid-cols-6'} h-16 items-center`}>
        {/* ─── STUDENT NAVIGATION BAR ─── */}
        {isStudentRole ? (
          <>
            {/* Student Tab 1: Timetable */}
            <Link
              href="/timetable"
              className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
              title="Class Timetable"
              aria-label="Class Timetable"
            >
              {isTimetableActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
              )}
              <PixbeIcon
                name="timetable"
                className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                  isTimetableActive
                    ? 'text-[var(--studio-navy)] '
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                }`}
              />
            </Link>

            {/* Student Tab 2: Attendance */}
            <Link
              href="/student-attendance"
              className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
              title="My Attendance"
              aria-label="My Attendance"
            >
              {isAttendanceActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
              )}
              <PixbeIcon
                name="attendance"
                className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                  isAttendanceActive
                    ? 'text-[var(--studio-navy)] '
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                }`}
              />
            </Link>

            {/* Student Tab 3: AI Assistant */}
            <button
              type="button"
              onClick={() => setAiAssistantOpen(true)}
              className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
              title="Ask AI Assistant"
              aria-label="Ask AI Assistant"
            >
              <Sparkles
                className="h-[22px] w-[22px] text-[var(--text-muted)] hover:text-[var(--studio-navy)] dark:text-[var(--text-muted)] dark:hover:text-blue-400 stroke-[1.6] transition-all duration-150 group-active:scale-90"
              />
            </button>

            {/* Student Tab 4: Announcements */}
            <Link
              href="/announcements"
              className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
              title="Announcements & Notices"
              aria-label="Announcements & Notices"
            >
              {isAnnouncementsActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
              )}
              <div className="relative flex items-center justify-center">
                <PixbeIcon
                  name="announcements"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isAnnouncementsActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
                {unreadNotifCount > 0 && !isAnnouncementsActive && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-[var(--studio-navy)] ring-2 ring-white dark:ring-[#0f1117]" />
                )}
              </div>
            </Link>
          </>
        ) : (
          /* ─── INSTITUTION & CORPORATE STAFF NAVIGATION BAR ─── */
          <>
            {/* Tab 1: Home */}
            <Link
              href="/dashboard"
              className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
              title="Home"
              aria-label="Home"
            >
              {isHomeActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
              )}
              <PixbeIcon
                name="home"
                className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                  isHomeActive
                    ? 'text-[var(--studio-navy)] '
                    : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                }`}
              />
            </Link>

            {/* Tab 2: Chat */}
            <Link
              href="/chat"
              className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
              title="Chat"
              aria-label={chatUnread > 0 ? `Chat, ${chatUnread} unread` : 'Chat'}
            >
              {isChatActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
              )}
              <div className="relative flex items-center justify-center">
                <PixbeIcon
                  name="chat"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isChatActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
                {chatUnread > 0 && (
                  <span
                    aria-hidden
                    className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 rounded-full bg-[#53886b] px-1 text-[9.5px] font-bold leading-4 text-white text-center ring-2 ring-white dark:ring-[#0f1117]"
                  >
                    {chatUnread > 99 ? '99+' : chatUnread}
                  </span>
                )}
              </div>
            </Link>

            {/* Tab 3: Students or People Directory */}
            <Link
              href={isInstitution ? '/student-directory' : '/hr'}
              className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
              title={isInstitution ? 'Student Directory' : 'People Directory'}
              aria-label={isInstitution ? 'Student Directory' : 'People Directory'}
            >
              {isPeopleActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
              )}
              {isInstitution ? (
                <PixbeIcon
                  name="students"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isPeopleActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
              ) : (
                <PixbeIcon
                  name="people"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isPeopleActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
              )}
            </Link>

            {/* Tab 4: Timetables (in Institution Mode) OR Attendance (in Corporate) */}
            {isInstitution ? (
              <Link
                href="/timetable"
                className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
                title="Class Timetables"
                aria-label="Class Timetables"
              >
                {isTimetableActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
                )}
                <PixbeIcon
                  name="timetable"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isTimetableActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
              </Link>
            ) : (
              <Link
                href="/attendance"
                className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
                title="Attendance & Leaves"
                aria-label="Attendance & Leaves"
              >
                {isAttendanceActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
                )}
                <PixbeIcon
                  name="attendance"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isAttendanceActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
              </Link>
            )}

            {/* Tab 5: Attendance (in Institution) OR Projects (in Corporate) */}
            {isInstitution ? (
              <Link
                href="/student-attendance"
                className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
                title="Class Attendance"
                aria-label="Class Attendance"
              >
                {isAttendanceActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
                )}
                <PixbeIcon
                  name="attendance"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isAttendanceActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
              </Link>
            ) : (
              <Link
                href="/projects"
                className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
                title="Projects & Tasks"
                aria-label="Projects & Tasks"
              >
                {isProjectsActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
                )}
                <PixbeIcon
                  name="projects"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isProjectsActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
              </Link>
            )}

            {/* Tab 6: Announcements */}
            <Link
              href="/announcements"
              className="relative flex items-center justify-center h-full w-full group cursor-pointer focus:outline-none"
              title="Announcements & Notices"
              aria-label="Announcements & Notices"
            >
              {isAnnouncementsActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 sm:w-11 h-[3.5px] rounded-b-full bg-[var(--studio-navy)] " />
              )}
              <div className="relative flex items-center justify-center">
                <PixbeIcon
                  name="announcements"
                  className={`h-[22px] w-[22px] transition-all duration-150 group-active:scale-90 ${
                    isAnnouncementsActive
                      ? 'text-[var(--studio-navy)] '
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] dark:text-[var(--text-muted)] dark:hover:text-slate-300'
                  }`}
                />
                {unreadNotifCount > 0 && !isAnnouncementsActive && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2 rounded-full bg-[var(--studio-navy)] ring-2 ring-white dark:ring-[#0f1117]" />
                )}
              </div>
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
