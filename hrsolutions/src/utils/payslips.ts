import type { EmployeePayslipDocument, PayrollRecord } from '@/types';
export interface PayslipLine { label: string; amount: number }
export interface IssuedPayslip { id:string; period:string; date:string; status:string; net:number; earnings:PayslipLine[]; deductions:PayslipLine[] }
const number=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
export function periodLabel(value:string):string {
 const iso=value.match(/^(\d{4})-(\d{1,2})(?:$|-)/);
 if(iso)return new Date(Number(iso[1]),Number(iso[2])-1,1).toLocaleDateString('en-IN',{month:'long',year:'numeric'});
 const date=new Date('1 '+value);return Number.isNaN(date.getTime())?value:date.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
}
export function payslipFromApi(row:Record<string,unknown>):IssuedPayslip {
 const earnings:PayslipLine[]=[{label:'Basic salary',amount:number(row.base_salary)}];
 // The stored allowance breakdown includes HRA and special allowance; do not count them twice.
 let breakdown=row.allowances_breakdown;try{if(typeof breakdown==='string')breakdown=JSON.parse(breakdown);}catch{breakdown=[];}
 if(Array.isArray(breakdown)&&breakdown.length){for(const item of breakdown)earnings.push({label:String(item.name||'Allowance'),amount:number(item.amount)});}
 else for(const [key,label] of [['hra','House rent allowance'],['special_allowance','Special allowance'],['conveyance_allowance','Conveyance allowance'],['medical_allowance','Medical allowance'],['other_allowances','Other allowances']])earnings.push({label,amount:number(row[key])});
 const deductions=[{label:'Provident fund',amount:number(row.pf_deduction)},{label:'Income tax',amount:number(row.tax_deduction)}];
 const net=number(row.net_payable),gross=earnings.reduce((sum,line)=>sum+line.amount,0),known=deductions.reduce((sum,line)=>sum+line.amount,0);
 if(gross-net-known>0.01)deductions.push({label:'Other deductions',amount:gross-net-known});
 return {id:String(row.id),period:periodLabel(String(row.month_year||'')),date:String(row.payment_date||''),status:String(row.status||'Processing'),net,earnings:earnings.filter(line=>line.amount!==0),deductions:deductions.filter(line=>line.amount!==0)};
}
export function payslipFromPayroll(row:PayrollRecord):IssuedPayslip {
 const earnings=[{label:'Basic salary',amount:row.basicSalary},{label:'Allowances',amount:row.allowances},{label:'Overtime pay',amount:row.overtimePay},{label:'Incentives',amount:row.incentives||0}].filter(line=>line.amount!==0);
 const deductions=[{label:'Deductions',amount:row.deductions},{label:'Income tax',amount:row.tax}].filter(line=>line.amount!==0);
 return {id:row.id,period:periodLabel(row.monthYear),date:row.paymentDate||'',status:row.status,net:row.netPay,earnings,deductions};
}
export function payslipFromDocument(row:EmployeePayslipDocument):IssuedPayslip {
 return {id:row.id,period:periodLabel(row.period),date:row.date,status:row.status,net:number(row.amount.replace(/[^0-9.-]/g,'')),earnings:[],deductions:[]};
}
export function sortPayslips(rows:IssuedPayslip[]):IssuedPayslip[]{return [...rows].sort((a,b)=>(Date.parse('1 '+b.period)||Date.parse(b.date)||0)-(Date.parse('1 '+a.period)||Date.parse(a.date)||0));}

export function salaryPeriod(period:string):string {const date=new Date('1 '+period);return Number.isNaN(date.getTime())?period:'1–'+new Date(date.getFullYear(),date.getMonth()+1,0).getDate()+' '+period;}
