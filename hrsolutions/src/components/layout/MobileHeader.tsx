'use client';
import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { UserAvatar } from '@/components/common/UserAvatar';
import { flattenWorkspaceNav } from '@/utils/workspaceNav';
import { getMobileMoreLinks } from '@/utils/mobileWorkspaceNav';
export function MobileHeader() {
 const { state, currentPersona, logout } = useApp();
 const pathname = usePathname()?.replace(/\/+$/, '') || '/';
 const params = useSearchParams();
 const query = params.toString();
 const [open, setOpen] = useState(false);
 const [instant, setInstant] = useState(false);
 const dialog = useRef<HTMLDialogElement>(null);
 const profile = useRef<HTMLButtonElement>(null);
 const closeControl = useRef<HTMLButtonElement>(null);
 const closeMenu = () => { dialog.current?.close(); setOpen(false); };
 useEffect(() => { setOpen(false); }, [pathname, query]);
 useEffect(() => { const media = window.matchMedia('(max-width: 767px)'); const closeOnDesktop = () => { if (!media.matches) setOpen(false); }; media.addEventListener('change', closeOnDesktop); return () => media.removeEventListener('change', closeOnDesktop); }, []);
 useEffect(() => {
  const element = dialog.current;
  if (!element || !open) return;
  if (!element.open) element.showModal();
  closeControl.current?.focus({ preventScroll: true });
  const panel = element.querySelector('.m2-account-panel');
  if (panel) panel.scrollTop = 0;
  const previous = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => { element.close(); document.body.style.overflow = previous; profile.current?.focus(); };
 }, [open]);
 if (!currentPersona) return null;
 const person = (state.employees || []).find(e => e.id === currentPersona.id || Boolean(e.email && e.email.toLowerCase() === currentPersona.email?.toLowerCase()));
 const myProfile = '/hr?emp=' + encodeURIComponent(person?.id || currentPersona.id);
 const home = pathname === '/' || pathname === '/dashboard';
 const titles: Record<string, string> = { '/projects': 'My work', '/attendance': params.get('tab') === 'leaves' ? 'Time off' : 'Attendance', '/leaves': 'Time off', '/timesheets': 'Timesheets', '/chat': 'Messages', '/more': 'Your workspace', '/announcements': 'Announcements', '/settings': 'Settings', '/reports': 'Reports', '/notifications': 'Notifications', '/hr': params.has('emp') ? 'My profile' : 'People' };
 const homeTitle = ['super_admin','admin'].includes(currentPersona.role) ? 'Company overview' : ['hr_manager','hr'].includes(currentPersona.role) ? 'HR overview' : ['project_manager','manager'].includes(currentPersona.role) ? 'Your team, at a glance' : 'Hi, ' + (currentPersona.name?.split(' ')[0] || 'there');
 const title = home ? homeTitle : titles[pathname || ''] || flattenWorkspaceNav(state.organization, currentPersona).find(n => pathname?.startsWith(n.path))?.label || 'Workspace';
 const unread = (state.notifications || []).some(n => !n.read);
 const options = [
  { label: 'My profile', href: myProfile }, { label: 'Switch workspace', href: '/more?panel=workspace' },
  { label: 'Notifications', href: '/notifications' }, { label: 'Settings', href: '/settings' },
  { label: 'Account security', href: myProfile + '&empTab=setting' },
 ];
 const { featured, additional } = getMobileMoreLinks(state.organization, currentPersona);
 const accountPaths = new Set(options.map(item => item.href));
 const workspaceLinks = [...featured, ...additional].filter(item => !accountPaths.has(item.href));
 return <>
  <header className="m2-header"><h1>{title}</h1><div id="m2-page-actions" />
   <Link className="m2-icon-button" href="/notifications" aria-label={unread ? 'Notifications, unread updates' : 'Notifications'}><img src="/mobile-v2/home-icon-bell.svg" width="24" height="24" alt="" />{unread && <span className="m2-unread-dot" />}</Link>
   <button ref={profile} type="button" className="m2-icon-button" onClick={event => { setInstant(event.detail === 0); setOpen(true); }} aria-label="Open account menu" aria-expanded={open} aria-controls="mobile-account-drawer"><UserAvatar src={currentPersona.avatar || person?.avatar} name={currentPersona.name} className="m2-header-avatar" /></button>
  </header>
  <dialog ref={dialog} id="mobile-account-drawer" className="m2-account-dialog" data-motion={instant ? "instant" : undefined} aria-labelledby="m2-account-title" onClose={() => { if (!dialog.current?.open) setOpen(false); }} onCancel={event => { event.preventDefault(); closeMenu(); }} onClick={event => { if (event.target === event.currentTarget) closeMenu(); }}>
   <div className="m2-account-panel">
    <div className="m2-account-heading"><h2 id="m2-account-title">Account</h2><button type="button" ref={closeControl} className="m2-icon-button" aria-label="Close account menu" onClick={closeMenu}><X size={20} strokeWidth={1.8} aria-hidden="true" /></button></div>
    <div className="m2-account-person"><UserAvatar src={currentPersona.avatar || person?.avatar} name={currentPersona.name} className="m2-account-avatar" /><strong>{currentPersona.name}</strong><span>{state.organization?.name || 'Your workspace'}</span></div>
    <nav className="m2-account-options" aria-label="Account">{options.map(item => <Link key={item.label} href={item.href} onClick={closeMenu}><span>{item.label}</span></Link>)}</nav>
    <nav className="m2-account-options m2-account-workspace" aria-label="Workspace"><h3>Explore workspace</h3>{workspaceLinks.map(item => <Link key={item.href} href={item.href} onClick={closeMenu}><span className="m2-account-link-copy"><span>{item.title}</span><small>{item.detail}</small></span></Link>)}</nav>
    <div className="m2-account-session"><button type="button" onClick={() => { setOpen(false); logout(); }}><img src="/mobile-v2/account-frame1.svg" width="20" height="20" alt="" />Log out</button></div>
   </div>
  </dialog>
 </>;
}
