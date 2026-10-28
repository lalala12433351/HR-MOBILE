const fs=require('node:fs/promises'),path=require('node:path');const root=path.resolve(__dirname,'..');const {chromium}=require('node:module').createRequire(root+'/package.json')('@playwright/test');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Users/danci/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});const page=await browser.newPage({viewport:{width:Number(process.env.MOBILE_WIDTH)||390,height:844}});let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://mobile.test/**',async r=>{try{const p=new URL(r.request().url()).pathname;if(p==='/bundle.js'||p==='/style.css')return await r.fulfill({contentType:p.endsWith('.js')?'application/javascript':'text/css',body:await fs.readFile(root+'/test-results/mobile'+p)});if(/^\/(fonts|sidebar|mobile-v2)\/[\w.-]+$/.test(p))return await r.fulfill({contentType:p.endsWith('.svg')?'image/svg+xml':'font/ttf',body:await fs.readFile(root+'/public'+p)});return await r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'});}catch(e){await r.abort()}});await fs.mkdir(root+'/test-results/mobile',{recursive:true});
const assert=(condition,message)=>{if(!condition)throw Error(message)};

await page.goto('https://mobile.test/attendance',{waitUntil:'networkidle'});
await page.getByRole('navigation',{name:'Attendance views'}).getByRole('button',{name:'History',exact:true}).click();
await page.getByRole('heading',{name:'Attendance history',exact:true}).waitFor();
const history=page.getByRole('region',{name:'Attendance history'});
assert(await history.getByRole('heading',{name:'Recent days'}).count()===1,'recent days heading');
assert(await page.getByRole('heading',{name:'Punch log'}).isVisible()===false,'old punch log replaced');
for(const period of ['Month','Week','Day']){
 await history.getByRole('tab',{name:period,exact:true}).click();
 assert(await history.getByRole('tab',{name:period,exact:true}).getAttribute('aria-selected')==='true',period+' filter selected');
 assert(await history.getByRole('tabpanel').getAttribute('aria-label')===period+' attendance',period+' results labelled');
}
const row=history.locator('article > button').first();
await row.click();
assert(await row.getAttribute('aria-expanded')==='true','day details open');
await row.click();
assert(await row.getAttribute('aria-expanded')==='false','day details close');
await history.getByRole('button',{name:'Request correction',exact:true}).click();
assert(await page.getByRole('dialog').count()>0,'existing correction form opens');
await page.keyboard.press('Escape');
await page.goto('https://mobile.test/attendance?view=history',{waitUntil:'networkidle'});
await page.getByRole('link',{name:'Back to attendance'}).click();
await page.getByRole('navigation',{name:'Attendance views'}).waitFor();
assert(!page.url().includes('view=history'),'back returns to overview');
assert(errors.length===0,'no runtime errors '+errors.join(';'));
console.log('PASS: history entry, Month/Week/Day filters, day expansion, correction form, back navigation.');
await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
