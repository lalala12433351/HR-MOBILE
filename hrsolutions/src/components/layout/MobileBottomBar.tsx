'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useChatUnread } from '@/hooks/useChat';
import { useApp } from '@/context/AppContext';
export function MobileBottomBar() {
 const pathname = usePathname()?.replace(/\/+$/, '') || '/';
 const { currentPersona } = useApp();
 const chatUnread = useChatUnread();
 const student = currentPersona?.role === 'student';
 const tabs = (student ? [
  { href: '/timetable', label: 'Home', icon: 'home' },
  { href: '/student-attendance', label: 'Time', icon: 'time' },
  { href: '/announcements', label: 'Notices', icon: 'chat' },
  { href: '/more', label: 'More', icon: 'more' },
 ] : [
  { href: student ? '/timetable' : '/dashboard', label: 'Home', icon: 'home' },
  { href: student ? '/student-directory' : '/projects', label: 'Work', icon: 'work' },
  { href: student ? '/student-attendance' : '/attendance', label: 'Time', icon: 'time' },
  { href: student ? '/announcements' : '/chat', label: student ? 'Notices' : 'Chat', icon: 'chat' },
  { href: '/more', label: 'More', icon: 'more' },
 ]);
 const active = pathname === '/' || pathname === '/dashboard' || pathname === '/timetable' ? 'home' : /^\/(projects)/.test(pathname) ? 'work' : /^\/(attendance|leaves|timesheets|student-attendance)/.test(pathname) ? 'time' : /^\/(chat|announcements)/.test(pathname) ? 'chat' : 'more';
 return <nav aria-label="Mobile navigation" className="pixbe-mobile-nav pixbe-mobile-tabs" style={{ '--mobile-tab-count': tabs.length } as React.CSSProperties}>
  {tabs.map(tab => <Link key={tab.label} href={tab.href} aria-current={active === tab.icon ? 'page' : undefined} className="pixbe-mobile-tab">
   <span className="pixbe-mobile-tab__icon"><img src={'/mobile-v2/' + active + '-icon-' + tab.icon + (active === 'home' && tab.icon === 'time' ? '1' : '') + '.svg'} width="22" height="22" alt="" />{tab.icon === 'chat' && !student && chatUnread > 0 && <span className="pixbe-mobile-tab__badge">{chatUnread > 99 ? '99+' : chatUnread}</span>}</span><span>{tab.label}</span>
  </Link>)}
 </nav>;
}
