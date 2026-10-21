'use strict';
const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const base=path.resolve('scratch','branches-desktop-'+Date.now());fs.mkdirSync(base,{recursive:true});const profile=path.join(base,'profile');
 const launch=()=>electron.launch({executablePath:path.resolve('node_modules/electron/dist/electron.exe'),args:[path.resolve('.'),'--user-data-dir='+profile]});let app;
 try{
  app=await launch();let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE',e.message)});page.on('dialog',d=>{console.log('DIALOG',d.message());d.accept()});
  await page.locator('[data-field=sender]').first().waitFor();
  const load=()=>page.evaluate(()=>window.electronAPI.storage.load());
  const switchTo=async id=>{if(await page.locator('#office-select').inputValue()===id)return;await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('#office-select').selectOption(id)]);await page.waitForFunction(id=>document.querySelector('#office-select').value===id&&document.querySelector('#save-state').textContent.includes('SQLite'),id);};
  await page.locator('[data-field=sender]').first().fill('Existing Mussafah');await page.locator('[data-field=sender]').first().blur();
  await page.locator('#start-serial').fill('100');await page.locator('#start-serial').blur();
  await page.locator('#view-journal').click();await page.locator('#journal-cash-count').fill('1000');await page.locator('#journal-cash-count').blur();await page.locator('#view-register').click();
  const original=(await load()).state;
  for(const [id,name] of [['satwa','Satwa customer'],['city','City customer']]){
   await switchTo(id);assert.equal((await load()).state.rows.length,0);assert.equal(await page.locator('#start-serial').inputValue(),'1');assert.equal(Object.keys((await load()).state.journal.cashCounts||{}).length,0);
   await page.locator('[data-field=sender]').first().fill(name);await page.locator('[data-field=sender]').first().blur();assert.equal((await load()).state.rows[0].sender,name);
   // A backup from another branch must not overwrite the selected branch.
   await page.locator('#file').setInputFiles({name:'other.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});await page.waitForFunction(()=>document.getElementById('file').value==='');assert.equal((await load()).state.rows[0].sender,name);
  }
  await switchTo('mussafah');assert.equal((await load()).state.rows[0].sender,'Existing Mussafah');assert.equal(await page.locator('#start-serial').inputValue(),'100');assert.deepEqual((await load()).state.journal.cashCounts,original.journal.cashCounts);
  for(const id of ['mussafah','satwa','city']){await switchTo(id);assert.match(await page.locator('#title-print').innerText(),new RegExp(id,'i'));}
  await page.screenshot({path:path.join(base,'desktop.png'),fullPage:true});await app.close();app=await launch();page=await app.firstWindow();page.on('dialog',d=>d.accept());await page.locator('[data-field=sender]').first().waitFor();
  await switchTo('satwa');assert.equal((await load()).state.rows[0].sender,'Satwa customer');await switchTo('mussafah');assert.equal((await load()).state.rows[0].sender,'Existing Mussafah');
  for(const f of ['hisaab.sqlite','hisaab-satwa.sqlite','hisaab-city.sqlite'])assert.equal(fs.readFileSync(path.join(profile,f)).subarray(0,15).toString(),'SQLite format 3');
  const denied=await app.evaluate(({ipcMain,BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const e={sender:w.webContents,senderFrame:w.webContents.mainFrame};ipcMain.emit('database-load',e,{office:'../../outside'});return e.returnValue;});assert.equal(denied.status,'error');assert.deepEqual(errors,[]);
  console.log('PASS desktop separate SQLite offices, empty new branches, numbering/cash isolation, backup mismatch rejection, switching/restart/invalid office. EVIDENCE',base);
 }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
