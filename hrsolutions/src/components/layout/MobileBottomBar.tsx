'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChatUnread } from '@/hooks/useChat';
import { useApp } from '@/context/AppContext';
import styles from './mobile-bottom-bar.module.css';

type TabIcon = 'home' | 'work' | 'time' | 'chat' | 'announcements';
type Tab = { href: string; label: string; icon: TabIcon };

/** Custom navigation glyphs share a 24px grid and a single stroke weight. */
function NavigationIcon({ name }: { name: TabIcon }) {
 const artwork: Record<TabIcon, React.ReactNode> = {
  home: <><path className={styles.iconFill} d="m5 9 7-5 7 5v10H5Z"/><path d="m4.5 9.2 6-4.5a2.5 2.5 0 0 1 3 0l6 4.5v8.3a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3ZM9.5 20.5v-6h5v6"/></>,
  work: <><path className={styles.iconFill} d="M3.5 10h17v7.5a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3Z"/><path d="M3.5 10V7A2.5 2.5 0 0 1 6 4.5h3l2 3h6.5a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3ZM3.5 10h17M9 15h6"/></>,
  time: <><circle className={styles.iconFill} cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></>,
  chat: <><path className={styles.iconFill} d="M8 4.5h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-5l-6 3v-3.5a4 4 0 0 1-1-3.5v-6a4 4 0 0 1 4-4Z"/><path d="M8 4.5h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-5l-6 3v-3.5a4 4 0 0 1-1-3.5v-6a4 4 0 0 1 4-4ZM8 10h8M8 13.5h5"/></>,
  announcements: <><path className={styles.iconFill} d="m9 8.5 10-4v14l-10-5Z"/><path d="m9 8.5 10-4v14l-10-5H6a2.5 2.5 0 0 1 0-5Zm0 0v5M6.5 13.5l1 6H11l-1.5-6"/></>,
 };
 return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{artwork[name]}</svg>;
}

export function MobileBottomBar() {
 const pathname = usePathname()?.replace(/\/+$/, '') || '/';
 const { currentPersona } = useApp();
 const chatUnread = useChatUnread();
 const student = currentPersona?.role === 'student';
 const tabs: Tab[] = student ? [
  { href: '/timetable', label: 'Home', icon: 'home' },
  { href: '/student-attendance', label: 'Time', icon: 'time' },
  { href: '/announcements', label: 'Announcements', icon: 'announcements' },
 ] : [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/projects', label: 'Work', icon: 'work' },
  { href: '/attendance', label: 'Time', icon: 'time' },
  { href: '/chat', label: 'Chat', icon: 'chat' },
  { href: '/announcements', label: 'Announcements', icon: 'announcements' },
 ];
 const active = pathname === '/' || pathname === '/dashboard' || pathname === '/timetable' ? 'home' : /^\/projects(?:\/|$)/.test(pathname) ? 'work' : /^\/(attendance|leaves|timesheets|student-attendance)(?:\/|$)/.test(pathname) ? 'time' : /^\/chat(?:\/|$)/.test(pathname) ? 'chat' : /^\/announcements(?:\/|$)/.test(pathname) ? 'announcements' : '';

 const activeIndex = tabs.findIndex(tab => tab.icon === active);

 return <nav aria-label="Mobile navigation" className={`pixbe-mobile-nav pixbe-mobile-tabs ${styles.nav}`} data-active={activeIndex >= 0} style={{ '--mobile-tab-count': tabs.length, '--mobile-active-index': Math.max(0, activeIndex) } as React.CSSProperties}>
  <span className={styles.track} aria-hidden="true"><span className={styles.indicator}/></span>
  {tabs.map(tab => <Link key={tab.icon} href={tab.href} aria-label={tab.icon === 'chat' && chatUnread > 0 ? `${tab.label}, ${chatUnread} unread messages` : tab.label} title={tab.label} aria-current={active === tab.icon ? 'page' : undefined} className={`pixbe-mobile-tab ${styles.tab}`}>
   <span className={`pixbe-mobile-tab__icon ${styles.icon}`}>
    <NavigationIcon name={tab.icon}/>
    {tab.icon === 'chat' && chatUnread > 0 && <span className={styles.badge} aria-hidden="true"/>}
   </span>
  </Link>)}
 </nav>;
}
