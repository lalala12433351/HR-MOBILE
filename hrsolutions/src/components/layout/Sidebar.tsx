'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserPersona } from '@/types';
import { useApp } from '@/context/AppContext';
import { OrgBrandMark } from '@/components/common/PixbeBrand';
import { PixbeIcon } from '@/components/common/PixbeIcon';
import { HelpSupportWidget } from '@/components/support/HelpSupportWidget';
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
  const chatUnread = useChatUnread();
  const navGroups = getWorkspaceNavGroups(state.organization, currentPersona);

  const [drawerMounted, setDrawerMounted] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const collapseTimer = useRef<number | null>(null);
  const desktopHelpRef = useRef<HTMLButtonElement>(null);
  const mobileHelpRef = useRef<HTMLButtonElement>(null);
  const helpAnchorRef = drawerOpen ? mobileHelpRef : desktopHelpRef;

  const expandSidebar = () => {
    if (collapseTimer.current) {
      window.clearTimeout(collapseTimer.current);
      collapseTimer.current = null;
    }
    setExpanded(true);
  };

  const collapseSidebar = () => {
    if (helpOpen) return;
    if (collapseTimer.current) window.clearTimeout(collapseTimer.current);
    collapseTimer.current = window.setTimeout(() => {
      setExpanded(false);
      collapseTimer.current = null;
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (collapseTimer.current) window.clearTimeout(collapseTimer.current);
    };
  }, []);

  useEffect(() => {
    if (helpOpen) {
      expandSidebar();
      return;
    }
    const dock = document.getElementById('pixbe-sidebar');
    if (dock?.matches(':hover')) return;
    collapseSidebar();
  }, [helpOpen]);

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
        : 'Pixbe Workspace';

  const renderRail = (showGroupLabels: boolean) => (
    <div className="sidebar-rail">
      <Link
        href={homeHref}
        onClick={onCloseMobile}
        className="sidebar-brand"
        title={isStudentRole ? 'Student attendance portal' : 'Workspace home'}
      >
        <OrgBrandMark src={state.organization?.logo} className="sidebar-brand-mark" />
        <span className="sidebar-brand-copy">
          <strong>Pixbe</strong>
          <small>{orgName}</small>
        </span>
      </Link>

      <nav className="sidebar-nav custom-scrollbar" aria-label="Primary">
        {navGroups.map((group) => (
          <div key={group.id} className="sidebar-nav-group">
            {group.label ? <p className="sidebar-nav-label">{group.label}</p> : null}
            {group.items.map((item) => {
              const active = isItemActive(item.path, item.id);
              const badge = item.id === 'chat' && chatUnread > 0 ? chatUnread : 0;

              return (
                <Link
                  key={item.id}
                  href={item.path}
                  onClick={() => handleItemClick(item.path, item.id)}
                  title={
                    showGroupLabels || expanded
                      ? undefined
                      : badge
                        ? `${item.label} (${badge} unread)`
                        : item.label
                  }
                  aria-label={badge ? `${item.label}, ${badge} unread` : item.label}
                  aria-current={active ? 'page' : undefined}
                  data-active={active ? 'true' : 'false'}
                  className="sidebar-nav-item"
                >
                  <PixbeIcon name={item.icon} className="sidebar-nav-icon" />
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

      <div className="sidebar-footer">
        <button
          ref={showGroupLabels ? mobileHelpRef : desktopHelpRef}
          type="button"
          onClick={() => {
            setHelpOpen((value) => !value);
            if (!showGroupLabels) expandSidebar();
          }}
          title={showGroupLabels || expanded || helpOpen ? undefined : 'Help & support'}
          aria-label="Help & support"
          aria-expanded={helpOpen}
          data-active={helpOpen ? 'true' : 'false'}
          className="sidebar-nav-item"
        >
          <PixbeIcon name="help" className="sidebar-nav-icon" />
          <span className="sidebar-nav-text">Help & support</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside
        id="pixbe-sidebar"
        className="sidebar-dock hidden lg:block fixed left-0 top-0 bottom-0 z-40"
        data-expanded={expanded ? 'true' : 'false'}
        onMouseEnter={expandSidebar}
        onMouseLeave={collapseSidebar}
        onFocusCapture={expandSidebar}
        onBlurCapture={(event) => {
          const next = event.relatedTarget as Node | null;
          if (!event.currentTarget.contains(next)) collapseSidebar();
        }}
      >
        {renderRail(false)}
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
            {renderRail(true)}
          </div>
        </div>
      )}

      <HelpSupportWidget
        open={helpOpen}
        onOpenChange={(next) => {
          setHelpOpen(next);
          if (next) expandSidebar();
        }}
        showLauncher={false}
        anchorRef={helpAnchorRef}
      />
    </>
  );
};
