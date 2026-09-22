'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  FolderKanban,
  Calendar,
  Clock,
  Users,
  BarChart3,
  Mail,
  GraduationCap,
  BookOpen,
} from 'lucide-react';
import { UserPersona } from '@/types';
import { useApp } from '@/context/AppContext';
import { KiteLogoMark } from '@/components/common/KiteLogoMark';
import { isInstitutionMode } from '@/utils/organizationMode';

interface SidebarProps {
  currentPersona?: UserPersona;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeModule?: string;
  onSelectModule?: (mod: string) => void;
}

const NAV_ITEM_STEP_PX = 44 + 10; // h-11 + gap-2.5

export const Sidebar: React.FC<SidebarProps> = ({
  currentPersona: propPersona,
  mobileOpen,
  onCloseMobile,
  activeModule,
  onSelectModule,
}) => {
  const pathname = usePathname();
  const { state, currentPersona: contextPersona } = useApp();
  const currentPersona = propPersona || contextPersona || state.currentPersona;

  const isInstitution = isInstitutionMode(state.organization, currentPersona);
  const isStudentRole = currentPersona?.role === 'student';

  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) {
      setDrawerMounted(true);
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setDrawerOpen(true));
      });
      return () => cancelAnimationFrame(id);
    }

    setDrawerOpen(false);
    const timeout = window.setTimeout(() => setDrawerMounted(false), 280);
    return () => window.clearTimeout(timeout);
  }, [mobileOpen]);

  const navItems = isStudentRole
    ? [
        {
          id: 'timetable',
          label: 'Class Timetable',
          path: '/timetable',
          icon: Calendar,
        },
        {
          id: 'student-attendance',
          label: 'My Attendance',
          path: '/student-attendance',
          icon: Clock,
        },
        {
          id: 'announcements',
          label: 'Announcements',
          path: '/announcements',
          icon: Mail,
        },
      ]
    : isInstitution
    ? [
        {
          id: 'dashboard',
          label: 'Home',
          path: '/dashboard',
          icon: Home,
        },
        {
          id: 'student-directory',
          label: 'Student Directory',
          path: '/student-directory',
          icon: GraduationCap,
        },
        {
          id: 'timetable',
          label: 'Class Timetables',
          path: '/timetable',
          icon: Calendar,
        },
        {
          id: 'student-attendance',
          label: 'Class Attendance',
          path: '/student-attendance',
          icon: BookOpen,
        },
        {
          id: 'hr',
          label: 'Staff & Faculty',
          path: '/hr',
          icon: Users,
        },
        {
          id: 'attendance',
          label: 'Staff Attendance',
          path: '/attendance',
          icon: Clock,
        },
        {
          id: 'announcements',
          label: 'Comms & Announcements',
          path: '/announcements',
          icon: Mail,
        },
        {
          id: 'reports',
          label: 'Reports & Analytics',
          path: '/reports',
          icon: BarChart3,
        },
      ]
    : [
        {
          id: 'dashboard',
          label: 'Home',
          path: '/dashboard',
          icon: Home,
        },
        {
          id: 'projects',
          label: 'Projects & Tasks',
          path: '/projects',
          icon: FolderKanban,
        },
        {
          id: 'attendance',
          label: 'Calendar & Schedules',
          path: '/attendance',
          icon: Calendar,
        },
        {
          id: 'timesheets',
          label: 'Timesheets & Attendance',
          path: '/timesheets',
          icon: Clock,
        },
        {
          id: 'hr',
          label: 'Team & Employees',
          path: '/hr',
          icon: Users,
        },
        {
          id: 'reports',
          label: 'Reports & Analytics',
          path: '/reports',
          icon: BarChart3,
        },
        {
          id: 'announcements',
          label: 'Comms & Announcements',
          path: '/announcements',
          icon: Mail,
        },
      ];

  const isItemActive = (path: string, id: string): boolean => {
    if (activeModule) {
      return activeModule === id;
    }
    if (!pathname) return false;
    if (path === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(path);
  };

  const activeIndex = navItems.findIndex((item) => isItemActive(item.path, item.id));

  const handleItemClick = (path: string, id: string) => {
    if (onSelectModule) {
      onSelectModule(id);
    }
    onCloseMobile();
  };

  const navContent = (
    <div className="sidebar-rail">
      <div className="flex flex-col items-center gap-4 shrink-0 w-full">
        <Link
          href={isStudentRole ? '/student-attendance' : '/dashboard'}
          onClick={onCloseMobile}
          className="sidebar-logo"
          title={isStudentRole ? 'Student Attendance Portal' : 'Workspace Dashboard'}
        >
          <KiteLogoMark className="w-5 h-5 text-white" />
        </Link>

        <nav className="sidebar-nav" aria-label="Primary">
          <span
            className="sidebar-nav-indicator"
            data-hidden={activeIndex < 0 ? 'true' : 'false'}
            style={{
              transform: `translateY(${Math.max(activeIndex, 0) * NAV_ITEM_STEP_PX}px)`,
            }}
            aria-hidden
          />

          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isItemActive(item.path, item.id);

            return (
              <div key={item.id} className="relative flex items-center justify-center w-full">
                <Link
                  href={item.path}
                  onClick={() => handleItemClick(item.path, item.id)}
                  title={item.label}
                  aria-current={active ? 'page' : undefined}
                  data-active={active ? 'true' : 'false'}
                  className="sidebar-nav-item"
                >
                  <Icon className="sidebar-nav-icon" />
                </Link>
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 z-40 w-[68px]">
        {navContent}
      </aside>

      {drawerMounted && (
        <div className="sidebar-drawer-root lg:hidden">
          <div
            onClick={onCloseMobile}
            className="sidebar-drawer-overlay"
            data-open={drawerOpen ? 'true' : 'false'}
            aria-hidden
          />
          <div
            className="sidebar-drawer-panel"
            data-open={drawerOpen ? 'true' : 'false'}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
