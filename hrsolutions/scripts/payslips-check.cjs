const fs=require('node:fs/promises'),path=require('node:path');const root=path.resolve(__dirname,'..');const {chromium}=require('node:module').createRequire(root+'/package.json')('@playwright/test');
(async()=>{const browser=await chromium.launch({headless:true,downloadsPath:path.join(root,'test-results','mobile','downloads'),executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const page=await browser.newPage({acceptDownloads:true,viewport:{width:Number(process.env.MOBILE_WIDTH)||390,height:844}});let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://mobile.test/**',async r=>{try{const p=new URL(r.request().url()).pathname;if(p==='/bundle.js'||p==='/style.css')return await r.fulfill({contentType:p.endsWith('.js')?'application/javascript':'text/css',body:await fs.readFile(root+'/test-results/mobile'+p)});if(/^\/(fonts|sidebar|mobile-v2)\/[\w.-]+$/.test(p))return await r.fulfill({contentType:p.endsWith('.svg')?'image/svg+xml':'font/ttf',body:await fs.readFile(root+'/public'+p)});return await r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'});}catch(e){await r.abort()}});await fs.mkdir(root+'/test-results/mobile',{recursive:true});
const assert=(condition,message)=>{if(!condition)throw Error(message)};

const checks=[];
async function visit(path){errors=[];await page.goto('https://mobile.test/'+path,{waitUntil:'networkidle'});await page.waitForTimeout(120);assert(await page.locator('#fixture-error').count()===0,path+' renders');}
async function verify(name){assert(errors.length===0,name+' runtime errors '+errors.join(';'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),name+' fits phone');checks.push(name);}

await page.addInitScript(()=>{window.fixturePayslips=[{id:'ps-sep',employee_id:'emp_1',month_year:'September 2026',base_salary:50000,hra:20000,special_allowance:5000,allowances_breakdown:[{name:'HRA',amount:20000},{name:'Special allowance',amount:5000}],pf_deduction:1800,tax_deduction:4550,net_payable:68450,status:'Paid',payment_date:'2026-09-30'}, {id:'ps-aug',employee_id:'emp_1',month_year:'August 2026',base_salary:50000,hra:20000,special_allowance:5000,pf_deduction:1800,tax_deduction:4550,net_payable:68450,status:'Paid',payment_date:'2026-08-31'}, {id:'foreign',employee_id:'emp_2',month_year:'December 2026',net_payable:999999,status:'Paid'}];});
await visit('payslips?role=employee');
assert(await page.getByText('September take-home').isVisible(),'latest issued month');
assert(await page.getByText('Paid on 30 September 2026').isVisible(),'payment date');
assert(await page.getByRole('button',{name:/December 2026/}).count()===0,'other employees excluded');
await page.screenshot({path:root+'/test-results/mobile/payslips-history-'+page.viewportSize().width+'.png'});
await verify('payslip history');
await page.getByRole('button',{name:'View latest payslip'}).click();
assert(await page.getByText('₹75,000',{exact:true}).isVisible(),'stored allowances counted once');
await page.screenshot({path:root+'/test-results/mobile/payslip-detail-'+page.viewportSize().width+'.png'});
const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Download payslip',exact:true}).click();const file=await downloaded;
assert(file.suggestedFilename().endsWith('.pdf'),'PDF filename');await file.saveAs(root+'/test-results/mobile/payslip-download.pdf');const bytes=await fs.readFile(root+'/test-results/mobile/payslip-download.pdf');assert(bytes.subarray(0,8).toString()==='%PDF-1.4','actual PDF bytes');
await verify('payslip PDF download');
await page.getByRole('button',{name:'Ask HR about this payslip'}).click();await page.getByRole('dialog').waitFor();assert(await page.getByRole('textbox',{name:'Subject',exact:true}).isVisible(),'real HR request form');
await verify('ask HR form');
await page.getByRole('button',{name:'Cancel',exact:true}).click();
await page.getByRole('button',{name:'Back to previous view'}).click();
await page.getByRole('button',{name:/August 2026/}).click();assert(await page.getByText('Salary period · 1–31 August 2026').isVisible(),'historical selection');
await page.getByRole('button',{name:'Back to previous view'}).click();await page.getByRole('button',{name:/Tax documents/}).click();assert(await page.getByText('No tax documents have been issued here yet.').isVisible(),'tax document availability');
await verify('history and tax document navigation');
await page.addInitScript(()=>{window.fixturePayslips=[];});await visit('payslips?role=employee');assert(await page.getByText(/No payslips have been issued yet/).isVisible(),'empty state');assert(await page.getByRole('button',{name:'View latest payslip'}).count()===0,'no fabricated latest slip');await verify('empty payslip state');
await page.addInitScript(()=>{window.fixturePayslips=null;});await visit('payslips?role=employee');await page.getByRole('button',{name:'Try again'}).waitFor();await page.evaluate(()=>{window.fixturePayslips=[];});await page.getByRole('button',{name:'Try again'}).click();assert(await page.getByText(/No payslips have been issued yet/).isVisible(),'retry recovers');await verify('loading failure retry');
console.log(JSON.stringify({passed:checks.length,checks}));await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
