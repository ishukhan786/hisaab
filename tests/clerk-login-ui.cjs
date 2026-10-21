'use strict';
// Fully isolated browser fixtures: no real accounts, sessions or cloud database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext();
  await context.addInitScript(()=>{
   let listener;
   window.Clerk={session:sessionStorage.fixtureSigned?{getToken:async()=>'fixture-token'}:null,
    load:async()=>{},mountUserButton:()=>{},addListener:fn=>{listener=fn;},
    mountSignIn:node=>{const button=document.createElement('button');button.textContent='Fixture sign in';button.onclick=()=>{sessionStorage.fixtureSigned='yes';window.Clerk.session={getToken:async()=>'fixture-token'};listener({session:window.Clerk.session});};node.append(button);}
   };
  });
  let cloudFails=false;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='localhost')return route.fulfill({contentType:'application/javascript',body:''});
   if(url.pathname.startsWith('/api/')){
    let data={};
    if(url.pathname==='/api/auth/config')data={provider:'clerk',ready:true,publishableKey:'pk_test_'+Buffer.from('fixture.clerk.accounts.dev$').toString('base64')};
    if(url.pathname==='/api/auth/status')data={isAuthenticated:!!route.request().headers().authorization,role:'owner'};
    if(url.pathname==='/api/branches')data={branches:[{id:'mussafah',name:'Mussafah Branch'}]};
    if(url.pathname==='/api/state'){
     if(cloudFails)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
     data={status:'empty'};
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   const filename=path.resolve(url.pathname==='/'?'index.html':'.'+url.pathname);
   if(!filename.startsWith(process.cwd()+path.sep)||!fs.existsSync(filename))return route.fulfill({status:404,body:''});
   const ext=path.extname(filename);const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
   const body=ext==='.html'?fs.readFileSync(filename,'utf8').replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/,''):fs.readFileSync(filename);
   return route.fulfill({body,contentType:types[ext]||'application/octet-stream'});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:39177/');
  await page.waitForFunction(()=>document.querySelector('#clerk-sign-in button'),{},{timeout:10000}).catch(async error=>{console.error({errors,view:await page.locator('#clerk-login-panel').innerText()});throw error;});
  await page.getByRole('button',{name:'Fixture sign in'}).click();
  await page.waitForFunction(()=>document.getElementById('pin-lock-overlay').hidden,{},{timeout:10000}).catch(async error=>{console.error({errors,view:await page.locator('#clerk-login-panel').innerText()});throw error;});
  assert.equal(await page.locator('#office-switcher').isVisible(),false);
  assert.equal(await page.locator('#clerk-login-panel').isVisible(),false);
  assert.deepEqual(errors,[]);
  await page.reload();await page.waitForFunction(()=>document.getElementById('pin-lock-overlay').hidden);
  cloudFails=true;await page.reload();await page.locator('#clerk-retry').waitFor({state:'visible'});
  assert((await page.locator('#clerk-login-error').textContent()).includes('Cloud load failed'));
  console.log('PASS full browser sign-in → app, returning session, hidden switcher and visible cloud-error recovery (isolated fixtures).');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
