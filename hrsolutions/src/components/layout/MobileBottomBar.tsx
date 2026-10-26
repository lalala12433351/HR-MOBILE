'use client';
import React from 'react';
import Link from 'next/link';
import { Megaphone } from 'lucide-react';
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
  { href: '/announcements', label: 'Announcements', icon: 'announcements' },
 ] : [
  { href: student ? '/timetable' : '/dashboard', label: 'Home', icon: 'home' },
  { href: student ? '/student-directory' : '/projects', label: 'Work', icon: 'work' },
  { href: student ? '/student-attendance' : '/attendance', label: 'Time', icon: 'time' },
  { href: student ? '/announcements' : '/chat', label: student ? 'Notices' : 'Chat', icon: 'chat' },
  { href: '/announcements', label: 'Announcements', icon: 'announcements' },
 ]);
 const active = pathname === '/' || pathname === '/dashboard' || pathname === '/timetable' ? 'home' : /^\/(projects)/.test(pathname) ? 'work' : /^\/(attendance|leaves|timesheets|student-attendance)/.test(pathname) ? 'time' : /^\/chat/.test(pathname) ? 'chat' : /^\/announcements/.test(pathname) ? 'announcements' : '';
 const assetState = ['home','work','time','chat'].includes(active) ? active : 'more';
 return <nav aria-label="Mobile navigation" className="pixbe-mobile-nav pixbe-mobile-tabs" style={{ '--mobile-tab-count': tabs.length } as React.CSSProperties}>
  {tabs.map(tab => <Link key={tab.label} href={tab.href} aria-current={active === tab.icon ? 'page' : undefined} className={`pixbe-mobile-tab${tab.icon === 'announcements' ? ' pixbe-mobile-tab--announcements' : ''}`}>
   <span className="pixbe-mobile-tab__icon">{tab.icon === 'announcements' ? <Megaphone size={22} strokeWidth={1.7} aria-hidden="true" /> : <img src={'/mobile-v2/' + assetState + '-icon-' + tab.icon + (active === 'home' && tab.icon === 'time' ? '1' : '') + '.svg'} width="22" height="22" alt="" />}{tab.icon === 'chat' && !student && chatUnread > 0 && <span className="pixbe-mobile-tab__badge">{chatUnread > 99 ? '99+' : chatUnread}</span>}</span><span>{tab.label}</span>
  </Link>)}
 </nav>;
}
