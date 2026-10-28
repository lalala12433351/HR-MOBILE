'use client';
import React,{useState} from 'react';
import {Student} from '@/types';
import {MobileRow} from './MobilePrimitives';
import {MobilePageTitle} from './MobilePageTitle';
export function MobileStudents({students,onSelect,onAdd,onExport,onTimetable}:{students:Student[];onSelect:(student:Student)=>void;onAdd?:()=>void;onExport:()=>void;onTimetable:()=>void}){
 const [query,setQuery]=useState('');const [status,setStatus]=useState('Active');
 const group=(student:Student)=>/invited|not activated/i.test(student.status||'')?'Invited':/inactive|suspend|deactiv|terminated/i.test(student.status||'')?'Inactive':'Active';
 const rows=students.filter(student=>group(student)===status&&`${student.name} ${student.rollNumber} ${student.grade} ${student.section}`.toLowerCase().includes(query.toLowerCase()));
 return <div className="m2-page m2-students"><MobilePageTitle title="Students"/><label className="m2-form-field">Search students<input type="search" placeholder="Name, ID, batch or department" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="m2-text-tabs" role="tablist" aria-label="Student status">{['Active','Invited','Inactive'].map(value=><button key={value} type="button" role="tab" aria-selected={status===value} onClick={()=>setStatus(value)}>{value}</button>)}</div><div>{rows.map(student=><MobileRow key={student.id} title={student.name} detail={[student.grade,student.section,student.status||'Active'].filter(Boolean).join(' · ')} onClick={()=>onSelect(student)}/>)}{!rows.length&&<p className="m2-empty">No students match this view.</p>}</div><button type="button" className="m2-secondary" onClick={onExport}>Export CSV</button>{onAdd&&<button type="button" className="m2-primary" onClick={onAdd}>Add student</button>}<MobileRow title="Class timetable" detail="View academic schedules" onClick={onTimetable}/></div>;
}
