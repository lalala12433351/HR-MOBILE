import { downloadBlob } from '@/lib/native/download';
import type { IssuedPayslip } from './payslips';
/** A local PDF export: no employee data is sent to a document conversion service. */
export async function downloadPayslipPdf(slip:IssuedPayslip,person:{name:string;code:string},company:string,currency:string):Promise<void>{
 await document.fonts.ready;
 const money=(amount:number)=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(amount);
 const rows:[string,string,boolean][]=[
  [company||'Payslip','',true],['Payslip · '+slip.period,slip.status,true],['Employee',person.name,false],['Employee ID',person.code,false],['Reference',slip.id,false],...(slip.date?[['Payment date',slip.date.slice(0,10),false] as [string,string,boolean]]:[]),
  ['Earnings','',true],...slip.earnings.map(line=>[line.label,money(line.amount),false] as [string,string,boolean]),
  ...(!slip.earnings.length?[['Breakdown not provided','',false] as [string,string,boolean]]:[]),
  ['Deductions','',true],...slip.deductions.map(line=>[line.label,money(line.amount),false] as [string,string,boolean]),
  ...(!slip.deductions.length?[['No deduction breakdown provided','',false] as [string,string,boolean]]:[]),
  ['Net pay',money(slip.net),true],['This is a system-generated payslip.','',false]
 ];
 const images:Uint8Array[]=[];let rowIndex=0;
 while(rowIndex<rows.length){
  const canvas=document.createElement('canvas');canvas.width=1240;canvas.height=1754;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF export is unavailable on this device.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);let y=110;
  while(rowIndex<rows.length){
   const [label,value,strong]=rows[rowIndex];
   ctx.fillStyle=strong?'#172234':'#5e6c7b';ctx.font=(strong?'600 ':'400 ')+(strong?'27px ':'23px ')+'"Plus Jakarta Sans", sans-serif';ctx.textAlign='left';
   // Wrap long names, references and labels instead of clipping document content.
   const wrap=(text:string,max:number)=>{const lines:string[]=[];let line='';for(const char of text){if(ctx.measureText(line+char).width>max){lines.push(line);line='';}line+=char;}if(line)lines.push(line);return lines;};
   const labels=wrap(label,value?560:1050),values=wrap(value,450);const lineCount=Math.max(labels.length,values.length);if(y+lineCount*32+24>1600&&y>110)break;rowIndex++;for(let i=0;i<Math.max(labels.length,values.length);i++){ctx.textAlign='left';if(labels[i])ctx.fillText(labels[i],80,y);ctx.textAlign='right';if(values[i])ctx.fillText(values[i],1160,y);y+=32;}y+=24;
   ctx.strokeStyle='#dde4e9';ctx.beginPath();ctx.moveTo(80,y-36);ctx.lineTo(1160,y-36);ctx.stroke();
  }
  ctx.fillStyle='#687789';ctx.font='20px sans-serif';ctx.textAlign='right';ctx.fillText('Page '+(images.length+1),1160,1680);
  const bytes=atob(canvas.toDataURL('image/jpeg',0.94).split(',')[1]);images.push(Uint8Array.from(bytes,c=>c.charCodeAt(0)));canvas.width=0;canvas.height=0;
 }
 const encoder=new TextEncoder();const chunks:Uint8Array[]=[];const offsets:number[]=[0];let position=0;
 const push=(value:string|Uint8Array)=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);position+=bytes.length;};
 const object=(id:number,body:string)=>{offsets[id]=position;push(id+' 0 obj\n'+body+'\nendobj\n');};
 push('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Count '+images.length+' /Kids ['+images.map((_,i)=>(3+i*3)+' 0 R').join(' ')+'] >>');
 images.forEach((bytes,i)=>{const page=3+i*3,image=page+1,content=page+2;object(page,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Image '+image+' 0 R >> >> /Contents '+content+' 0 R >>');offsets[image]=position;push(image+' 0 obj\n<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+bytes.length+' >>\nstream\n');push(bytes);push('\nendstream\nendobj\n');const command='q 595.28 0 0 841.89 0 0 cm /Image Do Q';object(content,'<< /Length '+encoder.encode(command).length+' >>\nstream\n'+command+'\nendstream');});
 const xref=position;push('xref\n0 '+offsets.length+'\n0000000000 65535 f \n');for(let i=1;i<offsets.length;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');push('trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');
 const bytes=new Uint8Array(position);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const filename=('Payslip-'+slip.period+'-'+person.code).replace(/[^a-zA-Z0-9._-]/g,'-')+'.pdf';
 await downloadBlob(new Blob([bytes],{type:'application/pdf'}),filename);
}
