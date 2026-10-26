const fs=require('node:fs/promises'),path=require('node:path');const root=path.resolve(__dirname,'..');const {chromium}=require('node:module').createRequire(root+'/package.json')('@playwright/test');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Users/danci/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});const page=await browser.newPage({viewport:{width:Number(process.env.MOBILE_WIDTH)||390,height:844}});let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://mobile.test/**',async r=>{try{const p=new URL(r.request().url()).pathname;if(p==='/bundle.js'||p==='/style.css')return await r.fulfill({contentType:p.endsWith('.js')?'application/javascript':'text/css',body:await fs.readFile(root+'/test-results/mobile'+p)});if(/^\/(fonts|sidebar)\/[\w.-]+$/.test(p))return await r.fulfill({body:await fs.readFile(root+'/public'+p)});return await r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'});}catch(e){await r.abort()}});await fs.mkdir(root+'/test-results/mobile',{recursive:true});
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const result=[];
async function open(screen){errors=[];await page.goto('https://mobile.test/'+screen,{waitUntil:'networkidle'});await page.waitForTimeout(200);assert(await page.locator('#fixture-error').count()===0,screen+' crashed');}
async function check(name){const info=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,overflow:[...document.querySelectorAll('main.pixbe-main')].some(e=>e.scrollWidth>e.clientWidth+2)}));assert(!info.overflow&&info.width<=info.viewport+2,name+' overflows '+JSON.stringify(info));assert(errors.length===0,name+' runtime errors '+errors.join(';'));result.push(name);}

for (const width of [320,390,768,1024,1440,1874]) {
  await page.setViewportSize({width,height:900});
  await open('timesheets');
  const toolbar = page.getByRole('region',{name:'Timesheet controls'});
  const views = toolbar.getByRole('group',{name:'Timesheet view'});
  for (const mode of ['week','month','list','day']) {
    await views.getByRole('button',{name:mode,exact:true}).click();
    assert(await views.getByRole('button',{name:mode,exact:true}).getAttribute('aria-pressed')==='true', 'view selection '+mode);
    await check(width+' '+mode+' layout');
  }
  const title = page.locator('.work-period-title');
  const today = await title.innerText();
  await toolbar.getByRole('button',{name:'Previous period',exact:true}).click();
  assert(await title.innerText()!==today,'previous period changes date');
  await toolbar.getByRole('button',{name:'Next period',exact:true}).click();
  assert(await title.innerText()===today,'next period restores date');
  if(width<768) await toolbar.locator('summary').click();
  const search=toolbar.getByRole('searchbox',{name:'Search logs'});
  const project=toolbar.getByRole('combobox',{name:'Filter by project'});
  const status=toolbar.getByRole('combobox',{name:'Filter by status'});
  const controls=await Promise.all([search.boundingBox(),project.boundingBox(),status.boundingBox()]);
  assert(controls.every(box=>box && box.width>=90 && box.height>=(width<768?40:30)),'usable fields '+width+' '+JSON.stringify(controls));
  if(width>=1440){
    const nav=await toolbar.getByRole('button',{name:'Previous period',exact:true}).boundingBox();
    const view=await views.boundingBox();
    assert(controls.every(box=>Math.abs(box.y-nav.y)<=2) && Math.abs(view.y-nav.y)<=2,'desktop fields share baseline '+width+' '+JSON.stringify(controls));
    const icon=await toolbar.locator('.work-log-search svg').boundingBox();
    assert(icon.width===14 && icon.height===14,'Figma search icon geometry');
    assert(icon.x+icon.width<controls[0].x,'search text clears icon');
  }
  await views.getByRole('button',{name:'list',exact:true}).click();
  const entries=page.locator(width<768?'.work-mobile-entry':'.work-time-list tbody tr').filter({hasText:'Finalize onboarding flow'});
  assert(await entries.count()>0,'fixture entries visible');
  await search.fill('No matching task');assert(await entries.count()===0,'search filters entries');
  await search.fill('');assert(await entries.count()>0,'clearing search restores entries');
  await project.selectOption('standalone');assert(await entries.count()===0,'project filter');await project.selectOption('All');
  await status.selectOption('Rejected');assert(await entries.count()===0,'status filter');await status.selectOption('All');
  await check(width+' date navigation and live filters');
  await page.screenshot({path:root+'/test-results/mobile/timesheet-toolbar-'+width+'.png'});
  await page.getByRole('button',{name:'Log time',exact:true}).click();await page.getByRole('dialog').waitFor();await check(width+' log time action');
  console.log('Passed toolbar at '+width);
}
await fs.writeFile(root+'/test-results/mobile/timesheet-toolbar-checks.json',JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.length}));await browser.close();})().catch(error=>{console.error(error.stack);process.exit(1)});
