'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { UserPersona } from '@/types';
import { useApp } from '@/context/AppContext';
import { PixbePixelMark } from '@/components/common/PixbeBrand';
import { PixbeIcon } from '@/components/common/PixbeIcon';
import { isInstitutionMode } from '@/utils/organizationMode';
import { getWorkspaceNavGroups } from '@/utils/workspaceNav';
import { useChatUnread } from '@/hooks/useChat';

interface SidebarProps {
  currentPersona?: UserPersona;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeModule?: string;
  onSelectModule?: (mod: string) => void;
}

// Original 16px assets from Figma's Workspace sidebar (193:56911).
// Painted with the nav item color so navigation stays one ink, not a rainbow.
const sidebarIcons: Record<string, string> = {
  dashboard: 'layout-dashboard',
  chat: 'inbox',
  projects: 'folder-kanban',
  attendance: 'file-clock',
  timesheets: 'file-clock1',
  'student-attendance': 'file-clock2',
  hr: 'users',
  announcements: 'inbox1',
  payroll: 'file-clock3',
  reports: 'file-clock1',
  settings: 'settings2',
};
export const Sidebar: React.FC<SidebarProps> = ({
  currentPersona: propPersona,
  mobileOpen,
  onCloseMobile,
  activeModule,
  onSelectModule,
}) => {
  const pathname = usePathname()?.replace(/\/+$/, '') || '/';
  const { state, currentPersona: contextPersona, setCommandPaletteOpen, setAiAssistantOpen } = useApp();
  const currentPersona = propPersona || contextPersona || state.currentPersona;

  const isInstitution = isInstitutionMode(state.organization, currentPersona);
  const isStudentRole = currentPersona?.role === 'student';
  const chatUnread = useChatUnread();
  const navGroups = getWorkspaceNavGroups(state.organization, currentPersona);

  const closeMobileRef = useRef(onCloseMobile);
  closeMobileRef.current = onCloseMobile;
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.documentElement.style.removeProperty('--sidebar-width');
  }, []);

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

  useEffect(() => {
    if (!drawerOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const panel = document.querySelector<HTMLElement>('.sidebar-drawer-panel');
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]') || []);
    focusable()[0]?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeMobileRef.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [drawerOpen]);

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

  const handleItemClick = (path: string, id: string) => {
    if (onSelectModule) {
      onSelectModule(id);
    }
    onCloseMobile();
  };

  const homeHref = isStudentRole ? '/student-attendance' : '/dashboard';
  const orgName =
    state.organization?.name &&
    state.organization.name !== 'Corporate Headquarters' &&
    state.organization.name !== 'Office Location'
      ? state.organization.name
      : isInstitution
        ? 'Institute workspace'
        : 'Pixbe workspace';
  const workspaceKind = isStudentRole
    ? 'Student workspace'
    : isInstitution
      ? 'Institute workspace'
      : 'Company workspace';

  const renderRail = () => (
    <div className="sidebar-rail">
      <div className="sidebar-top">
        <Link
          href={homeHref}
          onClick={onCloseMobile}
          className="sidebar-wordmark"
          title={isStudentRole ? 'Student attendance portal' : 'Workspace home'}
        >
          <PixbePixelMark />
          <strong>Pixbe HR</strong>
        </Link>
      </div>

      <div className="sidebar-org">
        <div>
          <strong>{orgName}</strong>
          <small>{workspaceKind}</small>
        </div>
      </div>

      <nav className="sidebar-nav custom-scrollbar" aria-label="Primary">
        {navGroups.map((group) => (
          <div key={group.id} className="sidebar-nav-group">
            {group.label ? <p className="sidebar-nav-label">{group.label}</p> : null}
            {group.items.map((item) => {
              const active = isItemActive(item.path, item.id);
              const badge = item.id === 'chat' && chatUnread > 0 ? chatUnread : 0;
              const iconAsset = item.id === 'attendance' && isInstitution
                ? 'file-clock2'
                : sidebarIcons[item.id];

              return (
                <Link
                  key={item.id}
                  href={item.path}
                  onClick={() => handleItemClick(item.path, item.id)}
                  title={item.label}
                  aria-label={badge ? `${item.label}, ${badge} unread` : item.label}
                  aria-current={active ? 'page' : undefined}
                  data-active={active ? 'true' : 'false'}
                  className="sidebar-nav-item"
                >
                  {iconAsset ? (
                    <span
                      aria-hidden="true"
                      className="sidebar-nav-icon sidebar-nav-glyph"
                      style={{
                        maskImage: `url(/sidebar/${iconAsset}.svg)`,
                        WebkitMaskImage: `url(/sidebar/${iconAsset}.svg)`,
                      }}
                    />
                  ) : (
                    <PixbeIcon name={item.icon} size={16} className="sidebar-nav-icon" />
                  )}
                  <span className="sidebar-nav-text">{item.label}</span>
                  {badge > 0 && (
                    <span aria-hidden className="sidebar-nav-badge">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-mobile-tools lg:hidden"><button type="button" onClick={() => { onCloseMobile(); setCommandPaletteOpen(true); }}><Search size={16} aria-hidden="true"/>Search workspace</button><button type="button" onClick={() => { onCloseMobile(); setAiAssistantOpen(true); }}><Sparkles size={16} aria-hidden="true"/>Ask assistant</button></div>
    </div>
  );

  return (
    <>
      <aside
        id="pixbe-sidebar"
        className="sidebar-dock hidden lg:block fixed left-0 top-0 bottom-0 z-40"
        data-collapsed="true"
      >
        {renderRail()}
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
            {renderRail()}
          </div>
        </div>
      )}

    </>
  );
};
