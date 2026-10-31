'use client';
import React, { useState } from 'react';
import { Holiday, LeaveRequest } from '@/types';
import { MyLeaveBalance } from '@/components/modules/attendance/MyLeavesView';
import { MobileHeaderAction } from './MobileHeaderAction';
import { MobileRow, MobileSection } from './MobilePrimitives';
import { toLocalDateKey } from '@/utils/attendancePunches';
import styles from './mobile-attendance-pages.module.css';

const dateLabel=(date:string)=>new Date(date.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
export function MobileTimeOff({balances,requests,holidays,onApply,onCancel,saving,onApprovals,canCancelManagerApproved=false,initialTab='Balances'}: {
 balances:MyLeaveBalance[];requests:LeaveRequest[];holidays:Holiday[];onApply:()=>void;onCancel:(id:string)=>unknown;saving:boolean;onApprovals?:()=>void;canCancelManagerApproved?:boolean;initialTab?:'Balances'|'Requests';
}) {
 const [tab,setTab]=useState<string>(initialTab);const [selected,setSelected]=useState<string|null>(null);
 const today=toLocalDateKey();
 const published=holidays.filter(h=>h.isApproved !== false).sort((a,b)=>a.date.localeCompare(b.date));
 const upcoming=requests.filter(r=>['Approved','Pending','Manager approved'].includes(r.status)&&r.endDate.slice(0,10)>=today).sort((a,b)=>a.startDate.localeCompare(b.startDate))[0];
 const paid=balances.filter(b=>!b.onRequest);const available=paid.reduce((sum,b)=>sum+(b.restricted?0:b.remaining),0);
 const nextHoliday=published.find(h=>h.date>=today);
 const selectedRequest=requests.find(r=>r.id===selected);
 return <div className={`m2-page m2-time-off ${styles.page}`}>
  <MobileHeaderAction><button type="button" className="m2-header-text-action" onClick={onApply}>Apply</button></MobileHeaderAction>
  <div className="m2-text-tabs" role="tablist" aria-label="Time off views">{['Balances','Requests','Holidays'].map(label=><button key={label} type="button" role="tab" aria-selected={tab===label} onClick={()=>{setTab(label);setSelected(null);}}>{label}</button>)}</div>
  {tab==='Balances' ? <>
   <div className="m2-metric"><span>Available leave</span><strong>{available} days</strong><small className="m2-success">{paid.map(b=>`${b.restricted?0:b.remaining} ${b.label.split(' ')[0].toLowerCase()}`).join(' · ')}</small></div>
   <MobileSection title="Upcoming leave">{upcoming ? <div className="m2-leave-upcoming"><span className={upcoming.status==='Approved'?'m2-success':'m2-warning'}>{upcoming.status}</span><strong>{upcoming.leaveType}</strong><small>{dateLabel(upcoming.startDate)}{upcoming.endDate!==upcoming.startDate?'–'+dateLabel(upcoming.endDate):''} · {upcoming.daysCount} {upcoming.daysCount===1?'day':'days'}</small></div>:<p className="m2-empty">No upcoming leave.</p>}</MobileSection>
   <MobileSection title="Your balances">{balances.map(balance=><MobileRow key={balance.label} title={balance.label} detail={`${balance.restricted?0:balance.remaining} of ${balance.restricted?0:balance.quota} days available`} onClick={balance.onRequest||onApply}/>)}<MobileRow title="Next holiday" detail={nextHoliday?`${nextHoliday.name} · ${dateLabel(nextHoliday.date)}`:'No upcoming published holidays'} onClick={()=>setTab('Holidays')}/></MobileSection>
  </> : tab==='Holidays' ? <MobileSection title="Published holidays">{published.map(holiday=><MobileRow key={holiday.id||holiday.date} title={holiday.name} detail={new Date(holiday.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} arrow={false}/>)}{!published.length&&<p className="m2-empty">No published holidays yet.</p>}<small className="m2-caption">No attendance is expected on a published holiday.</small></MobileSection> : <>
   <MobileSection title="Your requests">{requests.slice().sort((a,b)=>b.startDate.localeCompare(a.startDate)).map(request=><MobileRow key={request.id} title={request.leaveType} detail={`${dateLabel(request.startDate)}${request.startDate!==request.endDate?'–'+dateLabel(request.endDate):''} · ${request.status}`} onClick={()=>setSelected(selected===request.id?null:request.id)}/>)}{!requests.length&&<p className="m2-empty">No leave requests yet.</p>}</MobileSection>
   {selectedRequest&&<section className="m2-detail-section"><h2>{selectedRequest.leaveType}</h2><p>{selectedRequest.reason||'No reason provided'}</p><small>{selectedRequest.daysCount} days · {selectedRequest.status}</small>{(selectedRequest.status==='Pending'||(selectedRequest.status==='Manager approved'&&canCancelManagerApproved))&&<button type="button" className="m2-secondary" disabled={saving} onClick={()=>void onCancel(selectedRequest.id)}>Cancel request</button>}</section>}
   {onApprovals&&<MobileRow title="Leave approvals" detail="Review requests for your approval scope" onClick={onApprovals}/>}
  </>}
 </div>;
}
