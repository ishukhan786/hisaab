'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack);});
  let stored=null,revision=0;
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='localhost')return route.abort();
   if(url.pathname.startsWith('/api/')){
    if(url.pathname==='/api/save'){const body=route.request().postDataJSON();stored=body.state;revision++;return route.fulfill({json:{status:'saved',revision}});}
    return route.fulfill({json:stored?{status:'ok',state:stored,revision}:{status:'empty'}});
   }
   const file=path.resolve(url.pathname==='/'?'index.html':'.'+url.pathname);
   if(!file.startsWith(process.cwd()+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
   return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
  });
  await page.goto('http://localhost:39178/');
  await page.waitForTimeout(700);
  assert.deepEqual(errors,[],'Startup must not throw');
  await page.locator('#pin-unlock-input').fill('1234');
  await page.locator('#pin-unlock-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#pin-lock-overlay').hidden);
  const sender=page.locator('[data-field=sender]').first();await sender.fill('Web interaction check');await sender.press('Tab');
  await page.locator('[data-field=aed]').first().fill('150');await page.locator('[data-field=aed]').first().press('Tab');
  await page.locator('[data-field=pkr]').first().fill('1000');await page.locator('[data-field=pkr]').first().press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('#rows tr').length>=2);
  await page.locator('#view-journal').click();await page.locator('[data-journal=detail]').first().fill('Cash check');
  await page.locator('#view-register').click();await page.locator('#export-open').click();assert(await page.locator('#export-dialog').isVisible());await page.locator('#export-dialog').evaluate(dialog=>dialog.close());
  await page.locator('.more-menu summary').click();await page.locator('#pin-settings-btn').click();assert(await page.locator('#pin-dialog').isVisible());await page.locator('#close-pin-dialog').click();
  await page.evaluate(()=>{window.fixturePrinted=false;window.print=()=>{dispatchEvent(new Event('beforeprint'));window.fixturePrinted=true;dispatchEvent(new Event('afterprint'));};});
  await page.locator('#print').click();await page.waitForFunction(()=>window.fixturePrinted);
  assert(!(await page.locator('#title-print').textContent()).includes('undefined'));
  await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('MongoDB'));
  assert.equal(stored.rows[0].sender,'Web interaction check');
  await page.reload();await page.locator('#pin-unlock-input').fill('1234');await page.locator('#pin-unlock-form button[type=submit]').click();
  assert.equal(await page.locator('[data-field=sender]').first().inputValue(),'Web interaction check');
  assert.deepEqual(errors,[]);console.log('PASS web PIN unlock, entry typing/automatic draft, journal and export/settings buttons (isolated cloud fixture).');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
