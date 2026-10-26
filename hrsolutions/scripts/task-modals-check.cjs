const fs=require('node:fs/promises'),path=require('node:path');const root=path.resolve(__dirname,'..');const {chromium}=require('node:module').createRequire(root+'/package.json')('@playwright/test');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Users/danci/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});const page=await browser.newPage({viewport:{width:Number(process.env.MOBILE_WIDTH)||390,height:844}});let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://mobile.test/**',async r=>{try{const p=new URL(r.request().url()).pathname;if(p==='/bundle.js'||p==='/style.css')return await r.fulfill({contentType:p.endsWith('.js')?'application/javascript':'text/css',body:await fs.readFile(root+'/test-results/mobile'+p)});if(/^\/(fonts|sidebar)\/[\w.-]+$/.test(p))return await r.fulfill({body:await fs.readFile(root+'/public'+p)});return await r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'});}catch(e){await r.abort()}});await fs.mkdir(root+'/test-results/mobile',{recursive:true});
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const result=[];
async function open(screen){errors=[];await page.goto('https://mobile.test/'+screen,{waitUntil:'networkidle'});await page.waitForTimeout(200);assert(await page.locator('#fixture-error').count()===0,screen+' crashed');}
async function check(name){const info=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,overflow:[...document.querySelectorAll('main.pixbe-main')].some(e=>e.scrollWidth>e.clientWidth+2)}));assert(!info.overflow&&info.width<=info.viewport+2,name+' overflows '+JSON.stringify(info));assert(errors.length===0,name+' runtime errors '+errors.join(';'));result.push(name);}

for(const width of [320,390,1440]){ console.log('Viewport',width);
 await page.setViewportSize({width,height:900}); await open('projects?modal=1');
 await page.getByRole('button',{name:'Add task',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Add a task',exact:true});await form.waitFor();
 const box=await form.boundingBox();assert(width<768?box.width===width:box.width===420,'Figma task width '+width);
 await page.screenshot({path:root+'/test-results/mobile/add-task-'+width+'.png'});
 await form.getByLabel('Task title *',{exact:true}).fill('Figma task check');
 await form.getByLabel('Project',{exact:true}).selectOption('project1');
 await form.locator('summary').click();await form.getByLabel('Maya Patel',{exact:true}).check();await form.locator('summary').click();
 await form.getByLabel('Priority',{exact:true}).selectOption('Urgent');await form.getByLabel('Due date',{exact:true}).fill('2026-11-20');
 await form.getByLabel('Repeat',{exact:true}).selectOption('weekly');await form.getByLabel('Repeat until',{exact:true}).fill('2026-12-31');await form.getByLabel('Weekday',{exact:true}).selectOption('2');
 await form.getByLabel('Description',{exact:true}).fill('Keep all task options connected.');
 assert(await form.getByRole('switch',{name:'Billable task'}).isDisabled(),'billing client guard');
 await form.getByRole('button',{name:'Create task',exact:true}).click();
 console.log('Submitted task'); const payload=await page.evaluate(()=>window.fixtureApiCalls.findLast(c=>c.method==='projects.createTask')?.args[0]);
 assert(payload?.title==='Figma task check'&&payload.projectId==='project1'&&payload.priority==='urgent'&&payload.dueDate==='2026-11-20'&&payload.recurrence.frequency==='weekly'&&payload.recurrence.weekday===2&&payload.assignedToEmployeeIds.includes('emp_2')&&payload.billable===false,'create task payload '+JSON.stringify(payload));
 await check('add task fields and payload '+width);await page.keyboard.press('Escape');assert(await form.count()===0,'close task form');
 await page.getByRole('button',{name:'Details for Update employee handbook',exact:true}).click();const detail=page.getByRole('dialog',{name:'Task details',exact:true});await detail.waitFor();assert(await detail.getByRole('heading',{name:'Subtasks · 2 of 3 complete',exact:true}).isVisible(),'subtask completion data');assert(await detail.getByText('Onboarding checklist.pdf',{exact:true}).isVisible(),'attachment data');
 await page.screenshot({path:root+'/test-results/mobile/task-details-'+width+'.png'});await check('task details '+width);
 await detail.getByRole('button',{name:'Log time',exact:true}).click();const log=page.getByRole('dialog',{name:'Log time',exact:true});await log.waitFor();
 assert(await log.getByLabel('Work date *',{exact:true}).getAttribute('max')!==null,'date max');await log.getByLabel('Hours *',{exact:true}).fill('2.5');await log.getByLabel('Category',{exact:true}).selectOption('Design');await log.getByLabel('Notes',{exact:true}).fill('Design review');
 const timeBox=await log.boundingBox();assert(width<768?timeBox.width===width:timeBox.width===520,'Figma log time width');await page.screenshot({path:root+'/test-results/mobile/task-log-'+width+'.png'});await check('task log time '+width);
 await page.keyboard.press('Escape');assert(await log.count()===0&&await detail.isVisible(),'nested Escape preserves task');await page.keyboard.press('Escape');assert(await detail.count()===0,'close task details');
 await page.getByRole('tab',{name:'Projects',exact:true}).click();await page.getByRole('button',{name:'Add a project',exact:true}).click();const project=page.getByRole('dialog',{name:'Create a project',exact:true});await project.waitFor();await project.getByLabel('Project name *',{exact:true}).fill('Figma project');await project.getByLabel('Short code',{exact:true}).fill('FIG');await project.getByLabel('Budget hours',{exact:true}).fill('250');await project.getByLabel('Overview',{exact:true}).fill('Project overview');await page.screenshot({path:root+'/test-results/mobile/add-project-'+width+'.png'});await check('create project '+width);await page.keyboard.press('Escape');
}
await fs.writeFile(root+'/test-results/mobile/task-modals.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.length,checks:result}));await browser.close();})().catch(e=>{console.error(e.stack);process.exit(1)});

