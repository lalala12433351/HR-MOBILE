'use client';
import React from 'react';
import {Employee} from '@/types';
import {UserAvatar} from '@/components/common/UserAvatar';
import {MobilePageTitle} from './MobilePageTitle';
import {MobileSection} from './MobilePrimitives';
type RecordTab='general'|'public_profile'|'job'|'attendance_leave'|'payroll'|'documents'|'setting';
export function MobileEmployeeGeneral({employee,canEdit,onBack,onEdit,onTab}:{employee:Employee;canEdit:boolean;onBack:()=>void;onEdit:()=>void;onTab:(tab:RecordTab)=>void}){
 const information=(rows:[string,string|undefined][])=> <dl className="m2-profile-information">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value&&value!=='None'?value:'Not provided'}</dd></div>)}</dl>;
 return <div className="m2-page m2-employee-general"><MobilePageTitle title="Employee details" onBack={onBack}/><div className="m2-employee-identity"><UserAvatar src={employee.avatar} name={employee.name} className="m2-employee-photo"/><div><h2>{employee.name}</h2><p>{employee.designation}</p><small>{[employee.department,employee.team].filter(Boolean).join(' · ')}</small></div></div><div className="m2-employee-status"><span className="m2-success">{employee.accountStatus||employee.status||'Active'}</span><span>{employee.employeeId}</span></div>{canEdit&&<button type="button" className="m2-secondary" onClick={onEdit}>Edit details</button>}
 <MobileSection title="Work overview">{information([['Role',employee.designation],['Department',employee.department],['Team',employee.team],['Office',employee.officeName||employee.location],['Reports to',employee.managerName||employee.lineManager?.name]])}</MobileSection>
 <MobileSection title="Employee record"><div className="m2-record-menu">{([{id:'public_profile',label:'Public profile'},{id:'job',label:'Job & role'},{id:'attendance_leave',label:'Attendance & leaves'},...(canEdit?[{id:'payroll',label:'Payroll'}]:[]),{id:'documents',label:'Documents'},{id:'setting',label:'Settings'}] as {id:RecordTab;label:string}[]).map(item=><button type="button" key={item.id} onClick={()=>onTab(item.id)}>{item.label}<img src="/mobile-v2/time-navigation-forward.svg" width="16" height="16" alt=""/></button>)}</div></MobileSection>
 <MobileSection title="Personal information">{information([['Full name',employee.fullName||employee.name],['Gender',employee.gender],['Date of birth',employee.dateOfBirth],['Marital status',employee.maritalStatus],['Nationality',employee.nationality],['Phone',employee.phone],['Email',employee.email],['Personal tax ID',employee.personalTaxId]])}</MobileSection>
 <MobileSection title="Bank details">{information([['Account holder',employee.bankDetails?.accountHolderName],['Bank name',employee.bankDetails?.bankName],['Account number',employee.bankDetails?.accountNumber],['IFSC',employee.bankDetails?.ifscCode]])}</MobileSection>
 <MobileSection title="Residential address">{information([['Primary address',employee.primaryAddress],['City',employee.city],['State',employee.stateProvince],['Country',employee.country],['Postal code',employee.postalCode]])}</MobileSection>
 <MobileSection title="Emergency contact">{information([['Name',employee.emergencyContact?.name],['Relationship',employee.emergencyContact?.relation],['Phone',employee.emergencyContact?.phone]])}</MobileSection>
 </div>;
}
