'use client';
import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { X, UserRound, Bell, Settings, ShieldCheck, LogOut } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { UserAvatar } from '@/components/common/UserAvatar';
import { flattenWorkspaceNav } from '@/utils/workspaceNav';
import { getMobileMoreLinks } from '@/utils/mobileWorkspaceNav';
import { PixbeIcon } from '@/components/common/PixbeIcon';
import styles from './mobile-account-drawer.module.css';
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
  const panel = element.querySelector('[data-account-scroll]');
  if (panel) panel.scrollTop = 0;
  const previous = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  return () => { element.close(); document.body.style.overflow = previous; profile.current?.focus(); };
 }, [open]);
 if (!currentPersona) return null;
 const person = (state.employees || []).find(e => e.id === currentPersona.id || Boolean(e.email && e.email.toLowerCase() === currentPersona.email?.toLowerCase()));
 const myProfile = '/hr?emp=' + encodeURIComponent(person?.id || currentPersona.id);
 const attendanceHistory = ['/attendance','/student-attendance'].includes(pathname) && params.get('view') === 'history';
 const overviewParams = new URLSearchParams(query); overviewParams.delete('view');
 const attendanceOverview = pathname + (overviewParams.size ? '?' + overviewParams.toString() : '');
 const home = pathname === '/' || pathname === '/dashboard';
 const titles: Record<string, string> = { '/projects': 'My work', '/attendance': params.get('tab') === 'leaves' ? 'Time off' : 'Attendance', '/leaves': 'Time off', '/timesheets': 'Timesheets', '/chat': 'Messages', '/more': 'Your workspace', '/announcements': 'Announcements', '/settings': 'Settings', '/reports': 'Reports', '/notifications': 'Notifications', '/hr': params.has('emp') ? 'My profile' : params.get('tab') === 'directory' ? 'People' : ['admin','super_admin','hr_manager','hr'].includes(currentPersona.role) ? 'Employees' : 'People' };
 const homeTitle = ['super_admin','admin'].includes(currentPersona.role) ? 'Company overview' : ['hr_manager','hr'].includes(currentPersona.role) ? 'HR overview' : ['project_manager','manager'].includes(currentPersona.role) ? 'Your team, at a glance' : 'Hi, ' + (currentPersona.name?.split(' ')[0] || 'there');
 const title = attendanceHistory ? 'Attendance history' : home ? homeTitle : titles[pathname || ''] || flattenWorkspaceNav(state.organization, currentPersona).find(n => pathname?.startsWith(n.path))?.label || 'Workspace';
 const unread = (state.notifications || []).some(n => !n.read);
 const options = [
  { label: 'My profile', href: myProfile, icon: UserRound },
  { label: 'Notifications', href: '/notifications', icon: Bell },
  { label: 'Settings', href: '/settings', icon: Settings },
  { label: 'Account security', href: myProfile + '&empTab=setting', icon: ShieldCheck },
 ];
 const { featured, additional } = getMobileMoreLinks(state.organization, currentPersona);
 const accountPaths = new Set([...options.map(item => item.href), '/more?panel=workspace']);
 const workspaceLinks = [...featured, ...additional].filter(item => !accountPaths.has(item.href));
 const navigation = flattenWorkspaceNav(state.organization, currentPersona);
 const currentLink = (href: string) => {
  const [path, search] = href.split('?');
  if (path === '/hr' && params.has('emp') && !search) return false;
  if (path === '/hr' && search && !search.includes('empTab=') && params.has('empTab')) return false;
  return path === pathname && (!search || Array.from(new URLSearchParams(search)).every(([key,value]) => params.get(key) === value));
 };
 return <>
  <header className="m2-header"><div id="m2-page-back"/>{attendanceHistory && <Link className="m2-icon-button" href={attendanceOverview} aria-label="Back to attendance"><img src="/mobile-v2/auth-back.svg" width="20" height="20" alt="" /></Link>}<h1 id="m2-page-title"><span className="m2-default-title">{title}</span></h1><div id="m2-page-actions" />
   {!attendanceHistory && <Link className="m2-icon-button" href="/notifications" data-header-notifications="true" aria-label={unread ? 'Notifications, unread updates' : 'Notifications'}><img src="/mobile-v2/home-icon-bell.svg" width="24" height="24" alt="" />{unread && <span className="m2-unread-dot" />}</Link>}
   <button ref={profile} type="button" className="m2-icon-button" onClick={event => { setInstant(event.detail === 0); setOpen(true); }} aria-label="Open account menu" aria-expanded={open} aria-controls="mobile-account-drawer"><UserAvatar src={currentPersona.avatar || person?.avatar} name={currentPersona.name} className="m2-header-avatar" /></button>
  </header>
  <dialog ref={dialog} id="mobile-account-drawer" className={`m2-account-dialog ${styles.drawer}`} data-motion={instant ? "instant" : undefined} aria-labelledby="m2-account-title" onClose={() => { if (!dialog.current?.open) setOpen(false); }} onCancel={event => { event.preventDefault(); closeMenu(); }} onClick={event => { if (event.target === event.currentTarget) closeMenu(); }}>
   <div className="m2-account-panel">
    <div className="m2-account-heading"><h2 id="m2-account-title">Account</h2><button type="button" ref={closeControl} className="m2-icon-button" aria-label="Close account menu" onClick={closeMenu}><X size={20} strokeWidth={1.8} aria-hidden="true" /></button></div>
    <div className={styles.body} data-account-scroll="true">
     <section className={styles.identity} aria-label="Signed-in account">
      <div className={styles.person}>
       <UserAvatar src={currentPersona.avatar || person?.avatar} name={currentPersona.name} className="m2-account-avatar" />
       <div>
        <strong>{currentPersona.name}</strong>
        {(currentPersona.designation || person?.designation) && <small>{currentPersona.designation || person?.designation}</small>}
       </div>
      </div>
      <div className={styles.organization}>
       <span>{state.organization?.name || 'Workspace'}</span>
       <Link href="/more?panel=workspace" onClick={closeMenu} aria-label="Switch workspace">Switch</Link>
      </div>
     </section>
     <nav className={`m2-account-options ${styles.links}`} aria-label="Account menu">
      {options.map(item => (
       <Link key={item.label} href={item.href} onClick={closeMenu} aria-current={currentLink(item.href) ? 'page' : undefined}>
        <item.icon size={18} strokeWidth={1.6} aria-hidden="true"/><span>{item.label}</span>
       </Link>
      ))}
      {workspaceLinks.map(item => (
       <Link key={item.href} href={item.href} onClick={closeMenu} aria-current={currentLink(item.href) ? 'page' : undefined}>
        <PixbeIcon name={navigation.find(n=>n.path.split('?')[0] === item.href.split('?')[0])?.icon || 'tasks'} size={18}/><span>{item.title}</span>
       </Link>
      ))}
     </nav>
    </div>
    <div className="m2-account-session"><button type="button" onClick={() => { closeMenu(); logout(); }}><LogOut size={18} strokeWidth={1.6} aria-hidden="true"/>Log out</button></div>
   </div>
  </dialog>
 </>;
}
