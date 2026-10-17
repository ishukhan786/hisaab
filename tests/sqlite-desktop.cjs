const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
  const base=path.resolve('scratch','sqlite-desktop-'+Date.now());fs.mkdirSync(base,{recursive:true});
  const profile=path.join(base,'profile'),sourceExe=path.resolve('node_modules/electron/dist/electron.exe');
  const packaged=process.env.HISAAB_TEST_PACKAGED==='1';
  const index=packaged?path.resolve('dist/win-unpacked/resources/app.asar/index.html'):path.resolve('index.html');
  const legacy={version:4,title:'Migration test',date:'2026-10-17',startSerial:9,partySerials:{Alpha:25},branches:['Alpha'],partyCurrencies:{Alpha:'afn'},rows:[{id:'old-row',entryDate:'2026-10-17',sender:'Legacy customer',mobile:'03001234567',receiver:'Receiver',place:'Dubai',branch:'Alpha',balance:'10',aed:'100',pkr:'200',history:[{at:'2026-10-17T10:00:00Z',field:'sender',from:'',to:'Legacy customer'}]}],trash:[],lockedDates:['2026-10-16'],journal:{date:'2026-10-17',rows:[{id:'old-journal',date:'2026-10-17',detail:'Opening',debit:'',credit:'1000'}]}};
  // Seed the old browser origin without the new preload/database bridge.
  const seedMain=path.join(base,'seed.cjs');
  fs.writeFileSync(seedMain,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(profile)});app.whenReady().then(()=>{const w=new BrowserWindow({show:true});w.loadFile(${JSON.stringify(index)});});app.on('window-all-closed',()=>app.quit());`);
  let app;
  try{
    app=await electron.launch({executablePath:sourceExe,args:[seedMain]});let page=await app.firstWindow();await page.locator('#add').waitFor({state:'attached'});
    await page.evaluate(data=>localStorage.setItem('hisaab-register-v1',JSON.stringify(data)),legacy);await app.close();app=null;
    const launch=()=>electron.launch({executablePath:packaged?path.resolve('dist/win-unpacked/حساب.exe'):sourceExe,args:[...(!packaged?[path.resolve('.')]:[]),'--user-data-dir='+profile],timeout:30000});
    app=await launch();page=await app.firstWindow();page.setDefaultTimeout(15000);await page.locator('#add').waitFor({state:'attached'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    assert.equal(await page.locator('[data-field="sender"]').first().inputValue(),'Legacy customer');
    assert.match(await page.locator('#save-state').innerText(),/SQLite/);
    const saved=()=>page.evaluate(()=>window.electronAPI.storage.load());
    let db=await saved();assert.equal(db.state.journal.rows[0].credit,'1,000');assert.equal(db.state.partySerials.Alpha,25);assert.deepEqual(db.state.lockedDates,['2026-10-16']);
    assert.equal(fs.readFileSync(path.join(profile,'hisaab.sqlite')).subarray(0,16).toString(),'SQLite format 3\0');
    const migrations=fs.readdirSync(path.join(profile,'backups')).filter(f=>f.startsWith('migration-localstorage_'));assert.equal(migrations.length,1);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,'backups',migrations[0]),'utf8')),legacy);
    await page.evaluate(()=>localStorage.clear());await page.reload();
    assert.equal(await page.locator('[data-field="sender"]').first().inputValue(),'Legacy customer');
    await page.locator('[data-field="sender"]').first().fill('SQLite customer');await page.locator('[data-field="sender"]').first().blur();
    await page.locator('#view-journal').click();await page.locator('[data-journal="credit"]').first().fill('2500');await page.locator('[data-journal="credit"]').first().blur();
    await app.close();app=await launch();page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('dialog',d=>d.accept());await page.locator('#add').waitFor({state:'attached'});
    await page.locator('#view-register').click();assert.equal(await page.locator('[data-field="sender"]').first().inputValue(),'SQLite customer');
    db=await saved();assert.equal(db.state.journal.rows[0].credit,'2,500');assert(db.state.rows[0].history.some(h=>h.to==='SQLite customer'));
    // Inject a real SQLite transaction failure without modifying user files.
    const sql=async statement=>require('node:child_process').execFileSync(sourceExe,['-e',"const D=require(process.argv[1]);const d=new D(process.argv[2]);try{d.exec(process.argv[3]);}finally{d.close();}",path.resolve('node_modules/better-sqlite3'),path.join(profile,'hisaab.sqlite'),statement],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});
    await sql("CREATE TRIGGER fail_save BEFORE UPDATE ON app_state BEGIN SELECT RAISE(ABORT,'injected disk failure'); END");
    await page.locator('[data-field="sender"]').first().fill('Retry customer');await page.locator('[data-field="sender"]').first().blur();
    assert.equal((await saved()).state.rows[0].sender,'SQLite customer');assert(await page.locator('#retry-save').isVisible());
    await sql('DROP TRIGGER fail_save');await page.locator('#retry-save').click();assert.equal((await saved()).state.rows[0].sender,'Retry customer');
    // Both restore failures retain the old DB and current UI.
    const before=(await saved()).state,restore={...before,rows:[{...before.rows[0],sender:'RESTORED'}]};
    const restoreFile=async()=>{await page.locator('#file').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(restore))});await page.waitForFunction(()=>!document.body.inert&&document.getElementById('file').value==='');};
    const backups=path.join(profile,'backups'),held=path.join(profile,'backups-held');fs.renameSync(backups,held);fs.writeFileSync(backups,'blocked');
    await restoreFile();assert.deepEqual((await saved()).state,before);assert.equal(await page.locator('[data-field="sender"]').first().inputValue(),'Retry customer');fs.unlinkSync(backups);fs.renameSync(held,backups);
    await sql("CREATE TRIGGER fail_save BEFORE UPDATE ON app_state BEGIN SELECT RAISE(ABORT,'injected disk failure'); END");await restoreFile();assert.deepEqual((await saved()).state,before);await sql('DROP TRIGGER fail_save');
    await restoreFile();assert.equal((await saved()).state.rows[0].sender,'RESTORED');await page.reload();assert.equal(await page.locator('[data-field="sender"]').first().inputValue(),'RESTORED');
    // IPC rejects a frame other than the application's own main frame.
    const denied=await app.evaluate(({ipcMain,BrowserWindow})=>{const e={sender:BrowserWindow.getAllWindows()[0].webContents,senderFrame:{url:'file:///untrusted'}};ipcMain.emit('database-load',e);return e.returnValue;});assert.equal(denied.status,'error');
    await page.screenshot({path:path.join(base,'sqlite-desktop.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS desktop SQLite: migration/import, localStorage deletion, restart, journal/history/settings, actual transaction failure/retry, safety failure, restore rollback/reload and frame authorization.');console.log('EVIDENCE',base);
  }finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exit(1);});
