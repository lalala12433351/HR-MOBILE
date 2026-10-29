'use client';
import '@/components/chat/chat.css';
import React,{useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {AppState} from '@/services/store';
import {api} from '@/services/apiClient';
import {MobilePageTitle} from '@/components/mobile/MobilePageTitle';
import {MobileRow} from '@/components/mobile/MobilePrimitives';
import {NewHrRequestDialog} from '@/components/chat/NewHrRequestDialog';
import {IssuedPayslip,payslipFromApi,payslipFromDocument,payslipFromPayroll,sortPayslips,salaryPeriod} from '@/utils/payslips';
import {downloadPayslipPdf} from '@/utils/payslipPdf';
import styles from './payslips.module.css';
export function PayslipsPage({state}:{state:AppState}){
 const router=useRouter();const persona=state.currentPersona;
 // Resolve an exact identity; never show the first colleague's compensation as a fallback.
 const employee=state.employees.find(person=>person.id===persona?.id||Boolean(person.email&&persona?.email&&person.email.toLowerCase()===persona.email.toLowerCase()));
 const employeeId=employee?.id||persona?.id;
 const [remote,setRemote]=useState<{employeeId:string;rows:IssuedPayslip[]}|null>(null);
 const [request,setRequest]=useState<{employeeId:string;status:'loading'|'ready'|'error'}|null>(null);
 const [retry,setRetry]=useState(0);const [selectedId,setSelectedId]=useState<string|null>(null);const [tax,setTax]=useState(false);const [asking,setAsking]=useState(false);const [downloading,setDownloading]=useState(false);const [downloadError,setDownloadError]=useState('');
 const currency=state.customOptions?.payrollSettings?.defaultCurrency||state.organization?.currency||'INR';
 const money=(value:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:0}).format(value);
 useEffect(()=>{if(!employeeId)return;let active=true;setRequest({employeeId,status:'loading'});setSelectedId(null);setTax(false);
  api.payroll.getPayslips({employeeId}).then(response=>{if(!active)return;if(!response.success||!Array.isArray(response.data))throw new Error('Payslips could not be loaded.');
   const rows=(response.data as Record<string,unknown>[]).filter(row=>String(row.employee_id)===employeeId&&String(row.status).toLowerCase()!=='draft').map(payslipFromApi);
   setRemote({employeeId,rows});setRequest({employeeId,status:'ready'});
  }).catch(()=>{if(active)setRequest({employeeId,status:'error'});});return()=>{active=false;};
 },[employeeId,retry]);
 const slips=useMemo(()=>{
  const rows=remote?.employeeId===employeeId?[...remote.rows]:[];const periods=new Set(rows.map(row=>row.period));
  for(const record of state.payrolls||[]){if(record.employeeId!==employeeId||record.status==='Draft')continue;const row=payslipFromPayroll(record);if(!periods.has(row.period)){rows.push(row);periods.add(row.period);}}
  for(const document of employee?.payslipDocuments||[]){const row=payslipFromDocument(document);if(!periods.has(row.period)){rows.push(row);periods.add(row.period);}}
  return sortPayslips(rows);
 },[remote,employeeId,state.payrolls,employee?.payslipDocuments]);
 const latest=slips[0];const selected=slips.find(slip=>slip.id===selectedId);const loading=employeeId&&(!request||request.employeeId!==employeeId||request.status==='loading');
 const title=selected?selected.period.split(' ')[0]+' payslip':tax?'Tax documents':'My payroll';
 const back=()=>{setSelectedId(null);setTax(false);setDownloadError('');};
 const open=(slip:IssuedPayslip)=>{setSelectedId(slip.id);setDownloadError('');};
 const download=async()=>{if(!selected||!persona||downloading)return;setDownloading(true);setDownloadError('');try{await downloadPayslipPdf(selected,{name:employee?.name||persona.name,code:employee?.employeeId||persona.id},state.organization?.legalName||state.organization?.name||'',currency);}catch{setDownloadError('Your payslip could not be saved. Please try again.');}finally{setDownloading(false);}};
 if(!persona)return null;
 return <div className={styles.page}><MobilePageTitle title={title} onBack={selected||tax?back:undefined}/><header className={styles.desktopHeader}>{(selected||tax)&&<button type="button" onClick={back}>Back to payslips</button>}<h1>{title}</h1></header>
 {selected?<>
  <section className={styles.netCard} aria-label="Payslip net pay"><span className={styles.eyebrow}>NET PAY</span><strong>{money(selected.net)}</strong><span className={selected.status==='Paid'?styles.paid:styles.muted}>{selected.status}</span><p>Salary period · {salaryPeriod(selected.period)}</p></section>
  <section className={styles.breakdown}><h2>Earnings &amp; deductions</h2>{selected.earnings.length>0?<><div className={styles.line}><strong>Gross earnings</strong><span>{money(selected.earnings.reduce((sum,line)=>sum+line.amount,0))}</span></div>{selected.deductions.map((line,index)=><div className={styles.line} key={index}><strong>{line.label}</strong><span>− {money(line.amount)}</span></div>)}</>:<p className={styles.empty}>A detailed breakdown was not included with this issued payslip.</p>}</section>
  <button type="button" className="m2-primary" disabled={downloading} onClick={()=>void download()}>{downloading?'Preparing PDF…':'Download payslip'}</button>
  {downloadError&&<p role="alert" className={styles.error}>{downloadError}</p>}
  <button type="button" className="m2-secondary" onClick={()=>setAsking(true)}>Ask HR about this payslip</button>
 </>:tax?<><p className={styles.empty}>No tax documents have been issued here yet.</p><button type="button" className="m2-secondary" onClick={()=>setAsking(true)}>Ask HR for tax documents</button></>:<>
  {loading&&!slips.length?<p role="status" className={styles.empty}>Loading your payslips…</p>:latest?<><section className={styles.summary}><span>{latest.period.split(' ')[0]} take-home</span><strong>{money(latest.net)}</strong><small className={latest.status==='Paid'?styles.paid:styles.muted}>{latest.status}{latest.date?' on '+new Date(latest.date.slice(0,10)+'T12:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}):''}</small></section><button type="button" className="m2-primary" onClick={()=>open(latest)}>View latest payslip</button></>:request?.status!=='error'&&<p className={styles.empty}>No payslips have been issued yet. Your payslips will appear here when payroll is published.</p>}
  {request?.employeeId===employeeId&&request.status==='error'&&<div role="alert" className={styles.error}><p>We couldn’t refresh your payslips.{slips.length?' Showing available records.':''}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>Try again</button></div>}
  <section className={styles.history}><h2>Payslip history</h2><div>{slips.map(slip=><MobileRow key={slip.id} title={slip.period} detail={money(slip.net)+' · '+slip.status} onClick={()=>open(slip)}/>)}<MobileRow title="Tax documents" detail="View available documents" onClick={()=>setTax(true)}/></div></section>
 </>}
 <NewHrRequestDialog open={asking} onClose={()=>setAsking(false)} onCreated={conversation=>router.push('/chat?c='+encodeURIComponent(conversation.id))}/>
 </div>;
}
