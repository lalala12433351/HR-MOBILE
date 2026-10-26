const fs=require('node:fs/promises'),path=require('node:path');const root=path.resolve(__dirname,'..');const {chromium}=require('node:module').createRequire(root+'/package.json')('@playwright/test');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Users/danci/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe'});const page=await browser.newPage({viewport:{width:Number(process.env.MOBILE_WIDTH)||390,height:844}});let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('https://mobile.test/**',async r=>{try{const p=new URL(r.request().url()).pathname;if(p==='/bundle.js'||p==='/style.css')return await r.fulfill({contentType:p.endsWith('.js')?'application/javascript':'text/css',body:await fs.readFile(root+'/test-results/mobile'+p)});if(/^\/(fonts|sidebar|mobile-v2)\/[\w.-]+$/.test(p))return await r.fulfill({contentType:p.endsWith('.svg')?'image/svg+xml':'font/ttf',body:await fs.readFile(root+'/public'+p)});return await r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'});}catch(e){await r.abort()}});await fs.mkdir(root+'/test-results/mobile',{recursive:true});
const assert=(condition,message)=>{if(!condition)throw Error(message)};

await page.goto('https://mobile.test/projects',{waitUntil:'networkidle'});
const trigger=page.getByRole('button',{name:'Open account menu'});
const drawer=page.locator('#mobile-account-drawer');
for(let i=0;i<12;i++){
 await trigger.click();
 await page.getByRole('button',{name:'Close account menu'}).click();
 await page.waitForFunction(()=>!document.querySelector('#mobile-account-drawer').open);
 assert(await page.locator('body').evaluate(e=>e.style.overflow)!=='hidden','scroll unlocked after close '+i);
}
await trigger.click();
assert(await drawer.locator('nav img').count()===0,'profile navigation has no arrows');
await page.keyboard.press('Escape');
await page.waitForFunction(()=>!document.querySelector('#mobile-account-drawer').open);
await trigger.click();
await page.waitForTimeout(250);
await page.mouse.click(8,400);
await page.waitForFunction(()=>!document.querySelector('#mobile-account-drawer').open);
await trigger.click();
await drawer.evaluate(e=>e.close());
await page.waitForFunction(()=>document.querySelector('[aria-label="Open account menu"]').getAttribute('aria-expanded')==='false');
await trigger.click();
await drawer.getByRole('link',{name:'Settings',exact:true}).click();
await page.waitForFunction(()=>!document.querySelector('#mobile-account-drawer').open);
await trigger.click();
await page.setViewportSize({width:1000,height:844});
await page.waitForFunction(()=>!document.querySelector('#mobile-account-drawer').open);
await page.setViewportSize({width:390,height:844});
await trigger.click();
await page.waitForTimeout(300);
assert(await drawer.locator('.m2-account-panel').evaluate(e=>e.scrollTop)===0,'reopening starts at profile identity');
await page.screenshot({path:root+'/test-results/mobile/account-colours.png'});
assert(errors.length===0,'no runtime errors: '+errors.join(';'));
console.log('PASS: 12 reopen/close cycles, arrow removal, Escape, backdrop, native close, navigation, resize and scroll restoration.');
await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
