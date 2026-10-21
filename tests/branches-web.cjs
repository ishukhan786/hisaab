'use strict';
// Real HTTP handlers and browser against in-memory model adapters; never connects to Atlas.
const assert=require('node:assert/strict'),mongoose=require('mongoose'),fs=require('node:fs'),path=require('node:path');
process.env.JWT_SECRET='branch-test-secret-which-is-not-a-production-secret';
process.env.MONGODB_URI='mongodb://unused/test';
mongoose.connect=async()=>{Object.defineProperty(mongoose.connection,'readyState',{value:1,configurable:true});return mongoose;};
const app=require('../server');
const settings=new Map([['auth_pin','owner-secret']]),states=new Map(),backups=[];
const Setting=mongoose.model('AppSetting'),State=mongoose.model('HisaabState'),Backup=mongoose.model('HisaabBackup');
Setting.findOne=async q=>settings.has(q.key)?{key:q.key,value:settings.get(q.key)}:null;
Setting.findOneAndUpdate=async(q,v)=>{if(!v.$setOnInsert||!settings.has(q.key))settings.set(q.key,v.value||v.$setOnInsert?.value);return {value:settings.get(q.key)};};
State.findOne=async q=>structuredClone(states.get(q.key)||null);
State.create=async v=>{if(states.has(v.key))throw Object.assign(Error('duplicate'),{code:11000});states.set(v.key,structuredClone(v));return v;};
State.findOneAndUpdate=async(q,v)=>{let d=states.get(q.key);if(q.revision!==undefined&&d?.revision!==q.revision)return null;d={...d,...(v.$set||v)};if(v.$inc)d.revision+=v.$inc.revision;states.set(q.key,structuredClone(d));return d;};
Backup.create=async v=>{const d={...v,_id:new mongoose.Types.ObjectId().toString(),createdAt:new Date()};backups.push(d);return d;};
Backup.deleteMany=async q=>{for(let i=backups.length-1;i>=0;i--)if(backups[i].branch===q.branch&&backups[i]._id<q._id.$lt)backups.splice(i,1);};
Backup.findOne=async q=>backups.find(b=>b._id===q._id&&(q.branch?b.branch===q.branch:b.branch==='mussafah'))||null;
Backup.find=q=>({sort:()=>({limit:async n=>backups.filter(b=>q.branch?b.branch===q.branch:b.branch==='mussafah').sort((a,b)=>b._id.localeCompare(a._id)).slice(0,n)})});
const empty=()=>({version:4,title:'Branch test',date:'2026-10-21',rows:[],branches:[],trash:[],journal:{date:'2026-10-21',rows:[],cashCounts:{}}});
const row=(name)=>({id:'r1',entryDate:'2026-10-21',sender:name,mobile:'',receiver:'',place:'',branch:'',balance:'',aed:'10',pkr:'',history:[]});
(async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 let browser;
 const call=async(url,{token,branch,body}={})=>{const res=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(branch?{'X-Hisaab-Branch':branch}:{})},...(body?{body:JSON.stringify(body)}:{})});return {code:res.status,data:await res.json()};};
 try{
  let result=await call('/api/auth/login',{body:{password:'owner-secret'}});assert.equal(result.code,200);const owner=result.data.token;
  assert.equal(result.data.role,'owner');
  for(const id of ['mussafah','satwa','city']){
   assert.equal((await call('/api/state',{token:owner,branch:id})).data.status,'empty');
   const state=empty();state.rows=[row(id)];state.journal.cashCounts['2026-10-21']=id==='satwa'?'200':'100';
   assert.equal((await call('/api/save',{token:owner,branch:id,body:{state,revision:0}})).code,200);
   assert.equal((await call('/api/branches/staff',{token:owner,body:{branch:id,password:id+'-secret'}})).code,200);
  }
  assert.equal(states.get('primary').state.rows[0].sender,'mussafah');
  assert.equal(states.size,3);
  states.get('primary').state.pinCode='legacy-owner-secret';
  assert.equal((await call('/api/state',{token:owner,branch:'mussafah'})).data.state.pinCode,'');
  const staff=(await call('/api/auth/login',{body:{account:'satwa',password:'satwa-secret'}})).data.token;assert(staff);
  assert.equal((await call('/api/auth/status',{token:staff})).data.branch,'satwa');
  assert.equal((await call('/api/state',{token:staff})).data.state.rows[0].sender,'satwa');
  for(const branch of ['mussafah','city','../../outside']){
   assert.equal((await call('/api/state',{token:staff,branch})).code,403);
   assert.equal((await call('/api/save',{token:staff,branch,body:{state:empty(),revision:1}})).code,403);
   assert.equal((await call('/api/backups',{token:staff,branch})).code,403);
  }
  assert.equal((await call('/api/branches/staff',{token:staff,body:{branch:'city',password:'hijacked'}})).code,403);
  assert.equal((await call('/api/auth/change-pin',{token:staff,body:{currentPassword:'owner-secret',newPassword:'hijacked'}})).code,403);
  assert.equal((await call('/api/save',{token:owner,branch:'satwa',body:{state:empty(),revision:0}})).code,409);
  assert.equal((await call('/api/backup',{token:staff,body:{state:empty()}})).code,200);
  const backupId=backups.at(-1)._id;
  assert.equal((await call('/api/backup/'+backupId,{token:owner,branch:'city'})).code,404);
  assert.equal((await call('/api/backup/'+backupId,{token:staff})).code,200);
  assert.equal((await call('/api/save',{token:staff,body:{state:{...empty(),officeId:'city'},revision:1}})).code,400);
  assert.equal((await call('/api/backups',{token:owner,branch:'city'})).data.backups.length,0);
  assert.equal((await call('/api/backups',{token:staff})).data.backups.length,1);
  for(let i=0;i<35;i++)assert.equal((await call('/api/backup',{token:owner,branch:'city',body:{state:empty()}})).code,200);
  assert.equal(backups.filter(b=>b.branch==='city').length,30);
  assert.equal(backups.filter(b=>b.branch==='satwa').length,1);
  if(process.env.HISAAB_BRANCH_API_ONLY==='1'){
    await call('/api/branches/staff',{token:owner,body:{branch:'satwa',disable:true}});
    assert.equal((await call('/api/state',{token:staff})).code,401);
    console.log('PASS HTTP branch isolation, staff authorization, legacy owner compatibility, independent OCC/cash/backups, protected credentials and session revocation.');
    return;
  }
  const {chromium}=require('playwright');browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base);await page.locator('#login-account').selectOption('satwa');await page.locator('#pin-unlock-input').fill('satwa-secret');await page.locator('#pin-unlock-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#office-select').value==='satwa'&&document.querySelector('#pin-lock-overlay').hidden);
  assert(await page.locator('#office-select').isDisabled());assert(await page.locator('#office-staff-open').isHidden());assert.equal(await page.locator('[data-field=sender]').first().inputValue(),'satwa');
  await page.locator('[data-field=sender]').first().fill('Satwa edited');await page.locator('[data-field=sender]').first().blur();
  await page.waitForFunction(()=>document.querySelector('#retry-save').hidden&&document.querySelector('#save-state').textContent.includes('MongoDB'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#pin-lock-overlay').hidden);assert.equal(await page.locator('[data-field=sender]').first().inputValue(),'Satwa edited');
  assert.equal(states.get('primary').state.rows[0].sender,'mussafah');
  await page.evaluate(()=>{sessionStorage.removeItem('hisaab-auth-token-v1');localStorage.removeItem('hisaab-auth-token-v1');});await page.reload();
  await page.locator('#login-account').selectOption('owner');await page.locator('#pin-unlock-input').fill('owner-secret');await page.locator('#pin-unlock-form button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#pin-lock-overlay').hidden);
  await page.locator('#office-select').selectOption('city');await page.waitForFunction(()=>document.querySelector('#office-select').value==='city'&&document.querySelector('#pin-lock-overlay').hidden);
  assert.equal(await page.locator('[data-field=sender]').first().inputValue(),'city');await page.locator('.more-menu summary').click();await page.locator('#office-staff-open').click();assert(await page.locator('#office-staff-dialog').isVisible());await page.locator('#office-staff-close').click();
  const dir=path.resolve('scratch','branches-web-'+Date.now());fs.mkdirSync(dir,{recursive:true});
  for(const width of [1366,800,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(dir,width+'.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);}
  await page.setViewportSize({width:1366,height:900});await page.emulateMedia({media:'print'});await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));
  assert.match(await page.locator('#title-print').textContent(),/City Branch/);await page.screenshot({path:path.join(dir,'register-print.png'),fullPage:true});
  await page.evaluate(()=>dispatchEvent(new Event('afterprint')));await page.emulateMedia({media:'screen'});await page.locator('#view-journal').click();
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.office-print-name').textContent(),'City Branch');await page.screenshot({path:path.join(dir,'journal-print.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  await call('/api/branches/staff',{token:owner,body:{branch:'satwa',disable:true}});assert.equal((await call('/api/state',{token:staff})).code,401);
  assert.equal((await call('/api/auth/login',{body:{account:'satwa',password:'satwa-secret'}})).code,400);
  console.log('PASS branch HTTP authorization, independent revisions/data/cash/backups, staff revocation, browser login/edit/reload/owner switching and responsive layout. EVIDENCE',dir);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
