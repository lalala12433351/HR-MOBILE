'use client';
import React,{useState} from 'react';
import {Project,Task} from '@/types';
import {MobilePageTitle} from './MobilePageTitle';
import styles from './mobile-project-overview.module.css';
export function MobileProjectOverview({projects,tasks,onOpen,onNew,onBack}:{projects:Project[];tasks:Task[];onOpen:(project:Project)=>void;onNew?:()=>void;onBack:()=>void}){
 const [archived,setArchived]=useState(false);
 const isArchived=(project:Project)=>/archiv|cancel|complet/i.test(project.status||'');
 const rows=projects.filter(p=>isArchived(p)===archived);
 return <div className="m2-page m2-project-overview"><MobilePageTitle title="Projects" onBack={onBack}/>
 <div className="m2-text-tabs" role="tablist" aria-label="Project status"><button type="button" role="tab" aria-selected={!archived} onClick={()=>setArchived(false)}>Active {projects.filter(p=>!isArchived(p)).length}</button><button type="button" role="tab" aria-selected={archived} onClick={()=>setArchived(true)}>Archived</button></div>
 {rows.map(project=>{
  const assigned=tasks.filter(t=>t.projectId===project.id&&!t.isRecurrenceTemplate);
  const completed=assigned.filter(t=>t.status==='Completed').length;
  const percent=assigned.length?Math.round(completed/assigned.length*100):0;
  return <button key={project.id} type="button" className={styles.card} onClick={()=>onOpen(project)}>
   <span className={styles.heading}><strong>{project.name}</strong><small>{project.status||'In progress'}</small></span>
   <span className={styles.manager}>{project.managerName || 'No project manager assigned'}</span>
   <span className={styles.progressCopy}><span>{completed} of {assigned.length} tasks completed</span><strong>{percent}%</strong></span>
   <span className={styles.progress} aria-hidden="true"><span style={{width:percent+'%'}}/></span>
   <span className={styles.due}>{project.endDate?'Due '+new Date(project.endDate.slice(0,10)+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'No due date set'}</span>
  </button>;
 })}
 {!rows.length&&<p className="m2-empty">No {archived?'archived':'active'} projects match.</p>}{onNew&&<button type="button" className="m2-secondary" onClick={onNew}>New project</button>}
 </div>;
}
