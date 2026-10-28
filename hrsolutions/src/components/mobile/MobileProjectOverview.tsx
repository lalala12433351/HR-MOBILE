'use client';
import React,{useState} from 'react';
import {Project,Task} from '@/types';
import {MobileRow} from './MobilePrimitives';
import {MobilePageTitle} from './MobilePageTitle';
export function MobileProjectOverview({projects,tasks,onOpen,onNew,onBack}:{projects:Project[];tasks:Task[];onOpen:(project:Project)=>void;onNew?:()=>void;onBack:()=>void}){
 const [archived,setArchived]=useState(false);const [query,setQuery]=useState('');
 const isArchived=(project:Project)=>/archiv|cancel|complet/i.test(project.status||'');
 const rows=projects.filter(p=>isArchived(p)===archived&&p.name.toLowerCase().includes(query.toLowerCase()));
 return <div className="m2-page m2-project-overview"><MobilePageTitle title="Projects" onBack={onBack}/>
 <div className="m2-text-tabs" role="tablist" aria-label="Project status"><button type="button" role="tab" aria-selected={!archived} onClick={()=>setArchived(false)}>Active {projects.filter(p=>!isArchived(p)).length}</button><button type="button" role="tab" aria-selected={archived} onClick={()=>setArchived(true)}>Archived</button></div>
 <input className="m2-search-field" aria-label="Find a project" placeholder="Find a project" type="search" value={query} onChange={event=>setQuery(event.target.value)}/>
 {rows.map((project,index)=>{const assigned=tasks.filter(t=>t.projectId===project.id);const completed=assigned.filter(t=>t.status==='Completed').length;const detail=`${completed} / ${assigned.length} tasks${project.endDate?' · Due '+new Date(project.endDate.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''}`;return index===0?<button key={project.id} type="button" className="m2-project-featured" onClick={()=>onOpen(project)}><strong>{project.name}</strong><small>{project.managerName||'Project team'} · {(project.teamMembers||[]).length} members</small><span className="m2-success">{project.status||'In progress'}</span><span>{completed} / {assigned.length} tasks completed</span><span className="m2-project-progress"><span style={{width:`${assigned.length?completed/assigned.length*100:0}%`}}/></span><small>{detail.split(' · ').slice(1).join(' · ')||'No due date set'}</small></button>:<MobileRow key={project.id} title={project.name} detail={detail} onClick={()=>onOpen(project)}/>;})}
 {!rows.length&&<p className="m2-empty">No {archived?'archived':'active'} projects match.</p>}{onNew&&<button type="button" className="m2-secondary" onClick={onNew}>New project</button>}
 </div>;
}
