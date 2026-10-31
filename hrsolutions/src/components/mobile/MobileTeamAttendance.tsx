'use client';
import React,{useState} from 'react';
import {Employee,AttendanceRecord} from '@/types';
import {MobileRow} from './MobilePrimitives';
import {MobilePageTitle} from './MobilePageTitle';
import {UserAvatar} from '@/components/common/UserAvatar';
import {DateInput} from '@/components/common/DateInput';
import styles from './mobile-attendance-pages.module.css';
const punchTime=(value:string)=>{if(!value||value==='-')return '';const time=value.match(/(?:T|^)(\d{2}):(\d{2})/);if(!time)return value;const hour=Number(time[1]);return `${hour%12||12}:${time[2]} ${hour>=12?'PM':'AM'}`;};
export type MobileTeamRecord={emp:Employee;att?:AttendanceRecord;statusType:string;statusLabel:string;firstPunch:string;hoursFormatted:string};
export function MobileTeamAttendance({records,date,onDate,student,onSelect,onReport,onPhoto}:{records:MobileTeamRecord[];date:string;onDate:(date:string)=>void;student:boolean;onSelect?:(employee:Employee)=>void;onReport?:()=>void;onPhoto:(record:AttendanceRecord)=>void}){
 const [tab,setTab]=useState('Present');const [query,setQuery]=useState('');const [batch,setBatch]=useState('All');const [expanded,setExpanded]=useState<string|null>(null);
 const group=(r:MobileTeamRecord)=>['on_time','late','logged_out','wfh'].includes(r.statusType)?'Present':r.statusType==='on_leave'?'Away':'Absent';
 const filtered=records.filter(r=>(student||group(r)===tab)&&(batch==='All'||r.emp.designation===batch)&&`${r.emp.name} ${r.emp.department}`.toLowerCase().includes(query.toLowerCase()));
 const present=records.filter(r=>group(r)==='Present').length;
 return <div className={`m2-page m2-team-attendance ${styles.page}`}><MobilePageTitle title={student?'Class attendance':'Team attendance'}/>
 {!student && <label className="m2-form-field">Attendance date<DateInput aria-label="Team attendance date" value={date} onChange={e=>onDate(e.target.value)}/></label>}
 {student?<><label className="m2-form-field">Grade / batch<select value={batch} onChange={e=>setBatch(e.target.value)}><option value="All">All batches</option>{[...new Set(records.map(r=>r.emp.designation).filter(Boolean))].map(value=><option key={value}>{value}</option>)}</select></label><label className="m2-form-field">Date<DateInput value={date} onChange={e=>onDate(e.target.value)}/></label><div className="m2-metric"><span>Today’s register</span><strong>{present} present</strong><small>{records.filter(r=>r.statusType==='late').length} late · {records.filter(r=>group(r)==='Absent').length} absent · {records.length} enrolled</small></div></>:<><div className="m2-text-tabs" role="tablist" aria-label="Team attendance status">{['Present','Away','Absent'].map(value=><button key={value} type="button" role="tab" aria-selected={tab===value} onClick={()=>setTab(value)}>{value} {records.filter(r=>group(r)===value).length}</button>)}</div><input type="search" className="m2-search-field" aria-label="Search team attendance" placeholder="Search name or department" value={query} onChange={e=>setQuery(e.target.value)}/></>}
 <div className={styles.records}>{filtered.map(row=><React.Fragment key={row.emp.id}><MobileRow title={row.emp.name} detail={student?[row.statusLabel,punchTime(row.firstPunch),row.hoursFormatted].filter(Boolean).join(' · '):[row.firstPunch&&row.firstPunch!=='-'?'Clocked in '+punchTime(row.firstPunch):row.statusLabel,row.emp.department].filter(Boolean).join(' · ')} onClick={()=>setExpanded(expanded===row.emp.id?null:row.emp.id)}>{!student&&<UserAvatar src={row.emp.avatar} name={row.emp.name} className="m2-person-avatar"/>}</MobileRow>{expanded===row.emp.id&&<div className="m2-detail-section"><p>{row.statusLabel} · {row.hoursFormatted}</p>{onSelect&&<button type="button" className="m2-secondary" onClick={()=>onSelect(row.emp)}>View employee</button>}{row.att&&<button type="button" className="m2-secondary" onClick={()=>onPhoto(row.att!)}>View punch photos</button>}</div>}</React.Fragment>)}{!filtered.length&&<p className="m2-empty">No attendance records match this view.</p>}</div>
 {onReport&&<button type="button" className="m2-secondary" onClick={onReport}>View attendance report</button>}
 </div>;
}
