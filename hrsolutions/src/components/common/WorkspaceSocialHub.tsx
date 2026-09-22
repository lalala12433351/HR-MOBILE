'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { UserAvatar } from './UserAvatar';
import {
  Calendar,
  Gift,
  Award,
  Umbrella,
  ChevronRight,
  Clock,
  MapPin,
  FileText,
  CreditCard,
  Layers,
  Sparkles,
  PartyPopper,
  Users,
  Compass,
  ArrowRight,
} from 'lucide-react';
import { AppState } from '../../services/store';

interface WorkspaceSocialHubProps {
  state: AppState;
  onNavigateModule: (module: string) => void;
  onCheckInAttendance?: () => void;
}

export const WorkspaceSocialHub: React.FC<WorkspaceSocialHubProps> = ({
  state,
  onNavigateModule,
  onCheckInAttendance,
}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'all' | 'birthdays' | 'anniversaries' | 'holidays'>('all');

  // Holidays data matching the screenshot
  const holidays = [
    {
      id: 'h1',
      name: 'Makara Sankranti Festival',
      date: '15 Jan 2026',
      day: 'Thursday',
      month: 'JAN',
      dayNum: '15',
      color: 'bg-[#38bdf8] text-white',
      badgeColor: 'border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]',
    },
    {
      id: 'h2',
      name: 'Republic Day',
      date: '26 Jan 2026',
      day: 'Monday',
      month: 'JAN',
      dayNum: '26',
      color: 'bg-[#38bdf8] text-white',
      badgeColor: 'border-[#38bdf8]/40 bg-[#38bdf8]/10 text-[#38bdf8]',
    },
    {
      id: 'h3',
      name: 'Ugadi / Telugu New Year',
      date: '19 Mar 2026',
      day: 'Thursday',
      month: 'MAR',
      dayNum: '19',
      color: 'bg-[#fb923c] text-white',
      badgeColor: 'border-[#fb923c]/40 bg-[#fb923c]/10 text-[#fb923c]',
    },
    {
      id: 'h4',
      name: 'Ramzan (Eid-ul-Fitr)',
      date: '21 Mar 2026',
      day: 'Saturday',
      month: 'MAR',
      dayNum: '21',
      color: 'bg-[#fb923c] text-white',
      badgeColor: 'border-[#fb923c]/40 bg-[#fb923c]/10 text-[#fb923c]',
    },
    {
      id: 'h5',
      name: 'May Day',
      date: '01 May 2026',
      day: 'Friday',
      month: 'MAY',
      dayNum: '01',
      color: 'bg-[#a78bfa] text-white',
      badgeColor: 'border-[#a78bfa]/40 bg-[#a78bfa]/10 text-[#a78bfa]',
    },
    {
      id: 'h6',
      name: 'Bakrid (Eid al-Adha)',
      date: '28 May 2026',
      day: 'Thursday',
      month: 'MAY',
      dayNum: '28',
      color: 'bg-[#a78bfa] text-white',
      badgeColor: 'border-[#a78bfa]/40 bg-[#a78bfa]/10 text-[#a78bfa]',
    },
    {
      id: 'h7',
      name: 'Independence Day',
      date: '15 Aug 2026',
      day: 'Saturday',
      month: 'AUG',
      dayNum: '15',
      color: 'bg-[#f97316] text-white',
      badgeColor: 'border-[#f97316]/40 bg-[#f97316]/10 text-[#f97316]',
    },
    {
      id: 'h8',
      name: 'Ganesh Chaturthi',
      date: '14 Sep 2026',
      day: 'Monday',
      month: 'SEP',
      dayNum: '14',
      color: 'bg-[#ff5e62] text-white',
      badgeColor: 'border-[#ff5e62]/40 bg-[#ff5e62]/10 text-[#ff5e62]',
      isFeatured: true,
    },
    {
      id: 'h9',
      name: 'Gandhi Jayanthi',
      date: '02 Oct 2026',
      day: 'Friday',
      month: 'OCT',
      dayNum: '02',
      color: 'bg-[#e879f9] text-white',
      badgeColor: 'border-[#e879f9]/40 bg-[#e879f9]/10 text-[#e879f9]',
    },
  ];

  // Dynamically derive coworkers wishing list from real state
  const birthdays = useMemo(() => {
    return (state.employees || []).slice(0, 3).map((e) => ({
      name: e.name,
      shortName: e.name.slice(0, 2).toUpperCase(),
      date: 'Upcoming',
      avatar: e.avatar || '',
      badge: "B'DAY",
      badgeColor: 'bg-[#e879f9] text-[#131929] font-bold',
    }));
  }, [state.employees]);

  const anniversaries = useMemo(() => {
    return (state.employees || []).slice(0, 3).map((e) => {
      const years = e.joiningDate
        ? Math.max(1, new Date().getFullYear() - new Date(e.joiningDate).getFullYear())
        : 1;
      return {
        name: e.name,
        shortName: e.name.slice(0, 2).toUpperCase(),
        date: e.joiningDate || 'Recent Joiner',
        avatar: e.avatar || '',
        badge: `${years} YR${years > 1 ? 'S' : ''}`,
        badgeColor: 'bg-[#38bdf8] text-[#131929] font-bold',
      };
    });
  }, [state.employees]);

  // Dynamically derive leaves from real active leave records
  const leavesThisWeek = useMemo(() => {
    return (state.leaves || [])
      .filter((l) => l.status === 'Approved' || l.status === 'Pending')
      .slice(0, 6)
      .map((l) => {
        const emp = (state.employees || []).find((e) => e.id === l.employeeId || e.name === l.employeeName);
        return {
          name: l.employeeName,
          dates: l.startDate === l.endDate ? l.startDate : `${l.startDate} - ${l.endDate}`,
          daysCount: `${l.daysCount || 1} day${(l.daysCount || 1) > 1 ? 's' : ''}`,
          avatar: emp?.avatar || '',
          dotColor: l.status === 'Approved' ? 'bg-[#38bdf8]' : 'bg-[#fb923c]',
          isFuture: new Date(l.startDate) > new Date(),
        };
      });
  }, [state.leaves, state.employees]);

  return (
    <div className="space-y-6">
      {/* 1. Quick Actions Row (From Image 1 & 5) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <button
          onClick={() => {
            router.push('/attendance?tab=leaves&apply=true');
            onNavigateModule('attendance');
          }}
          className="group flex flex-col items-center justify-center p-4 rounded-2xl border border-[#232d44] bg-[#161d2e] hover:bg-[#1b2337] hover:border-[#fb923c]/50 transition-all text-center shadow-md cursor-pointer"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fb923c]/20 text-[#fb923c] group-hover:scale-110 transition-transform mb-2">
            <Calendar className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold text-white">Apply Leave</span>
        </button>

        <button
          onClick={() => {
            router.push('/documents');
            onNavigateModule('documents');
          }}
          className="group flex flex-col items-center justify-center p-4 rounded-2xl border border-[#232d44] bg-[#161d2e] hover:bg-[#1b2337] hover:border-[#a78bfa]/50 transition-all text-center shadow-md cursor-pointer"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7c5cfc]/20 text-[#a78bfa] group-hover:scale-110 transition-transform mb-2">
            <FileText className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold text-white">View Payslip</span>
        </button>

        <button
          onClick={() => {
            router.push('/attendance?tab=leaves');
            onNavigateModule('attendance');
          }}
          className="group flex flex-col items-center justify-center p-4 rounded-2xl border border-[#232d44] bg-[#161d2e] hover:bg-[#1b2337] hover:border-[#e879f9]/50 transition-all text-center shadow-md cursor-pointer"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e879f9]/20 text-[#e879f9] group-hover:scale-110 transition-transform mb-2">
            <Gift className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold text-white">Leave Balance</span>
        </button>

        <button
          onClick={() => onNavigateModule('timesheets')}
          className="group flex flex-col items-center justify-center p-4 rounded-2xl border border-[#232d44] bg-[#161d2e] hover:bg-[#1b2337] hover:border-[#38bdf8]/50 transition-all text-center shadow-md"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#38bdf8]/20 text-[#38bdf8] group-hover:scale-110 transition-transform mb-2">
            <Layers className="h-5 w-5" />
          </div>
          <span className="text-xs font-bold text-white">Logs & Shifts</span>
        </button>
      </div>

      {/* 2. Featured Ganesh Chaturthi Holiday Banner Card (From Image 5) */}
      <div className="relative overflow-hidden rounded-2xl border border-[#ff5e62]/40 bg-gradient-to-r from-[#ff5e62] to-[#ff7675] p-5 text-white shadow-xl">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-white">
              <PartyPopper className="h-3 w-3" /> Next Public Holiday
            </span>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Ganesh Chaturthi
            </h3>
            <p className="text-xs text-white/90 font-medium">
              Monday, 14 Sep 2026 • Official Paid Holiday (All Offices)
            </p>
          </div>

          <button
            onClick={() => onNavigateModule('hr')}
            className="flex items-center gap-1.5 self-start sm:self-auto rounded-xl bg-white text-[#ff5e62] font-bold text-xs px-4 py-2.5 shadow-md hover:bg-white/90 active:scale-95 transition-all"
          >
            <span>View 2026 Calendar</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* 3. Wish Them & Off This Week Grid (From Image 1, 3, 4) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card A: Wish Them (Birthdays & Anniversaries) */}
        <div className="rounded-2xl border border-[#232d44] bg-[#161d2e] p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-[#232d44] pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#e879f9]/20 text-[#e879f9]">
                <Gift className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">Wish them</h3>
                <p className="text-[10px] text-[#8e9eb5]">Celebrate your team's milestones</p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-[#131929] p-1 rounded-xl border border-[#232d44]">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  activeTab === 'all' ? 'bg-[#7c5cfc] text-white' : 'text-[#8e9eb5] hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab('birthdays')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  activeTab === 'birthdays' ? 'bg-[#e879f9] text-[#131929]' : 'text-[#8e9eb5] hover:text-white'
                }`}
              >
                Birthdays
              </button>
              <button
                onClick={() => setActiveTab('anniversaries')}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all ${
                  activeTab === 'anniversaries' ? 'bg-[#38bdf8] text-[#131929]' : 'text-[#8e9eb5] hover:text-white'
                }`}
              >
                Anniversaries
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {/* Anniversaries Section */}
            {(activeTab === 'all' || activeTab === 'anniversaries') && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-[#8e9eb5] uppercase tracking-wider flex items-center justify-between">
                  <span>Work Anniversaries</span>
                  <span className="text-[#38bdf8] font-semibold">They are making an impact</span>
                </p>
                {anniversaries.length === 0 ? (
                  <p className="text-xs text-[#8e9eb5] py-2">No work anniversaries recorded.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {anniversaries.map((person, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#131929] border border-[#232d44] hover:border-[#38bdf8]/40 transition-all"
                      >
                        <div className="relative shrink-0">
                          <UserAvatar
                            src={person.avatar}
                            name={person.name}
                            className="h-9 w-9"
                          />
                          <span className={`absolute -bottom-1 -right-1 px-1 py-0.2 rounded-full text-[8px] tracking-tight ${person.badgeColor}`}>
                            {person.badge}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{person.name}</p>
                          <p className="text-[10px] text-[#38bdf8] font-medium">{person.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Birthdays Section */}
            {(activeTab === 'all' || activeTab === 'birthdays') && (
              <div className="space-y-2 pt-2">
                <p className="text-[10px] font-bold text-[#8e9eb5] uppercase tracking-wider flex items-center justify-between">
                  <span>Upcoming Birthdays</span>
                  <span className="text-[#e879f9] font-semibold">Make them feel special</span>
                </p>
                {birthdays.length === 0 ? (
                  <p className="text-xs text-[#8e9eb5] py-2">No upcoming birthdays.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {birthdays.map((person, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#131929] border border-[#232d44] hover:border-[#e879f9]/40 transition-all"
                      >
                        <div className="relative shrink-0">
                          <UserAvatar
                            src={person.avatar}
                            name={person.name}
                            className="h-9 w-9"
                          />
                          <span className={`absolute -bottom-1 -right-1 px-1 py-0.2 rounded-full text-[8px] tracking-tight ${person.badgeColor}`}>
                            {person.badge}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">{person.name}</p>
                          <p className="text-[10px] text-[#e879f9] font-medium">{person.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card B: Off This Week & Upcoming Leaves (From Image 1 & 3) */}
        <div className="rounded-2xl border border-[#232d44] bg-[#161d2e] p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-[#232d44] pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#38bdf8]/20 text-[#38bdf8]">
                <Umbrella className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-white">Off this week</h3>
                <p className="text-[10px] text-[#8e9eb5]">See which coworkers are away</p>
              </div>
            </div>

            <button
              onClick={() => onNavigateModule('hr')}
              className="text-xs font-bold text-[#a78bfa] hover:text-[#c4b5fd] flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-3">
            <p className="text-[10px] font-bold text-[#596b84] uppercase tracking-wider">
              THIS WEEK ({leavesThisWeek.length})
            </p>

            <div className="space-y-2">
              {leavesThisWeek.length === 0 ? (
                <p className="text-xs text-[#8e9eb5] py-2">No coworkers on leave this week.</p>
              ) : (
                leavesThisWeek.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#131929] border border-[#232d44]"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        src={item.avatar}
                        name={item.name}
                        className="h-8 w-8"
                      />
                      <div>
                        <p className="text-xs font-bold text-white">{item.name}</p>
                        <p className="text-[10px] text-[#8e9eb5]">{item.dates}</p>
                      </div>
                    </div>

                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8e9eb5] bg-[#161d2e] px-2.5 py-1 rounded-lg border border-[#232d44]">
                      <span className={`h-1.5 w-1.5 rounded-full ${item.dotColor}`} />
                      {item.daysCount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Holidays in 2026 Interactive Badge Grid (From Image 2) */}
      <div className="rounded-2xl border border-[#232d44] bg-[#161d2e] p-5 shadow-md space-y-4">
        <div className="flex items-center justify-between border-b border-[#232d44] pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[#fb923c]/20 text-[#fb923c]">
              <Calendar className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-white">Holidays in 2026</h3>
              <p className="text-[10px] text-[#8e9eb5]">Approved company statutory & festive leaves</p>
            </div>
          </div>

          <span className="text-[10px] font-bold text-[#2dd4bf] bg-[#2dd4bf]/10 px-2.5 py-1 rounded-full border border-[#2dd4bf]/30">
            {holidays.length} Mandatory Holidays
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {holidays.map((h) => (
            <div
              key={h.id}
              className={`flex items-center gap-3 p-3 rounded-xl bg-[#131929] border ${
                h.isFeatured ? 'border-[#ff5e62]/60 ring-1 ring-[#ff5e62]/30' : 'border-[#232d44]'
              } hover:border-[#7c5cfc]/50 transition-all group`}
            >
              {/* Left Date Block */}
              <div className={`flex flex-col items-center justify-center rounded-xl px-2.5 py-1.5 ${h.color} shrink-0 shadow-xs`}>
                <span className="text-[9px] font-bold tracking-wider uppercase leading-none">{h.month}</span>
                <span className="text-sm font-bold leading-none mt-0.5">{h.dayNum}</span>
              </div>

              {/* Holiday Info */}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate group-hover:text-[#a78bfa] transition-colors">
                  {h.name}
                </p>
                <p className="text-[10px] text-[#8e9eb5] mt-0.5">{h.day}</p>
              </div>

              {h.isFeatured && (
                <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#ff5e62]/20 text-[#ff5e62] border border-[#ff5e62]/40">
                  Next
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
