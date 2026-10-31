'use client';
import React, { useState } from 'react';
import { Employee } from '@/types';
import { UserAvatar } from '@/components/common/UserAvatar';
import { MobilePageTitle } from './MobilePageTitle';
import styles from './mobile-people.module.css';
import { MobileRow } from './MobilePrimitives';

export function MobilePeople({ employees, team, manage, directory, organization, onSelect, onAdd, onExport, onDirectory, onOrganization, onDepartment }: {
 employees: Employee[]; team: Employee[]; manage: boolean; directory: boolean; organization?: string;
 onSelect: (person: Employee) => void; onAdd: () => void; onExport: () => void; onDirectory: () => void; onOrganization: () => void; onDepartment: (name: string) => void;
}) {
 const [query,setQuery] = useState('');
 const [filter,setFilter] = useState('Active');
 const [scope,setScope] = useState('Everyone');
 const status = (person: Employee) => /invited|not activated/i.test(person.accountStatus||person.status||'') ? 'Invited' : person.isDeactivated || /deactivated|inactive|suspended|terminated/i.test(person.accountStatus||person.status||'') ? 'Inactive' : 'Active';
 const all = directory && scope === 'My team' ? team : employees;
 const visible = all.filter(person => (directory || status(person).toLowerCase() === filter.toLowerCase()) && `${person.name} ${person.employeeId} ${person.designation} ${person.department}`.toLowerCase().includes(query.toLowerCase()));
 const departments = [...new Set(all.map(person=>person.department).filter(Boolean))];
 return <section className={`m2-page m2-people-page ${styles.directory}`}><MobilePageTitle title={directory?'People':'Employees'}/>
  <input className="m2-search-field" type="search" value={query} onChange={event=>setQuery(event.target.value)} aria-label={directory ? 'Search people' : 'Search employees'} placeholder={directory ? 'Name, role or department' : 'Search name or employee ID'} />
  <div className="m2-text-tabs" role="tablist" aria-label={directory ? 'Directory scope' : 'Employee status'}>{(directory ? ['Everyone','My team','Departments'] : ['Active','Invited','Inactive']).map(label=><button key={label} type="button" role="tab" aria-selected={(directory?scope:filter)===label} onClick={()=>directory?setScope(label):setFilter(label)}>{label}{!directory && label!=='Inactive' ? ` ${employees.filter(person=>status(person).toLowerCase()===label.toLowerCase()).length}` : ''}</button>)}</div>
  <div className={styles.list}>{directory && scope==='Departments' ? departments.map(department=><MobileRow key={department} title={department} detail={`${all.filter(person=>person.department===department).length} people`} onClick={()=>onDepartment(department)} />) : visible.map(person=><button type="button" className={styles.person} key={person.id} onClick={()=>onSelect(person)}><UserAvatar name={person.name} src={person.avatar} className="m2-person-avatar"/><span className={styles.personCopy}><strong>{person.name}</strong><span>{person.designation || 'No role assigned'}</span><small>{[person.department,person.employeeId].filter(Boolean).join(' · ')}</small></span><span className={styles.personStatus} data-status={status(person)}>{status(person)}</span></button>)}{!visible.length && !(directory && scope==='Departments') && <p className="m2-empty">No people match this view.</p>}</div>
  {manage && !directory && <div className={styles.actions}><button type="button" className="m2-primary" onClick={onAdd}>Add employee</button><button type="button" className="m2-secondary" onClick={onExport}>Export list</button></div>}
  {directory ? <small className="m2-caption">{employees.length} people in {organization || 'your workspace'}</small> : <div><MobileRow title="People directory" detail="Find teammates and departments" onClick={onDirectory}/><MobileRow title="Organisation chart" detail="Teams and reporting relationships" onClick={onOrganization}/></div>}
 </section>;
}
