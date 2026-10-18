const {chromium,_electron}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');const {pathToFileURL}=require('url');
(async()=>{
 const base=path.resolve('scratch','cash-summary-'+Date.now());fs.mkdirSync(base,{recursive:true});let app,browser;
 try{
  let p;
  if(process.env.HISAAB_TEST_DESKTOP==='1'||process.env.HISAAB_TEST_PACKAGED==='1'){
   const packaged=process.env.HISAAB_TEST_PACKAGED==='1';app=await _electron.launch({executablePath:path.resolve(packaged?'dist/win-unpacked/حساب.exe':'node_modules/electron/dist/electron.exe'),args:[...(!packaged?[path.resolve('.')]:[]),'--user-data-dir='+path.join(base,'profile')]});p=await app.firstWindow();await p.locator('#add').waitFor();
  }else{browser=await chromium.launch({channel:'msedge',headless:true});p=await browser.newPage({viewport:{width:1366,height:1000}});await p.goto(pathToFileURL(path.resolve('index.html')).href);}
  p.setDefaultTimeout(15000);
  p.on('dialog',d=>d.accept());const errors=[];p.on('pageerror',e=>errors.push(e.message));
  const fixture={version:4,title:'Cash test',date:'2026-10-18',branches:[],rows:[],trash:[],journal:{date:'2026-10-18',rows:[{id:'opening',date:'2026-10-17',detail:'Opening',credit:'50000',debit:''},{id:'received',date:'2026-10-18',detail:'Received',credit:'100000',debit:''},{id:'paid',date:'2026-10-18',detail:'Paid',credit:'',debit:'120000'}]}};
  console.log('READY');await require('./seed-state.cjs')(p,fixture);console.log('SEEDED');await p.locator('#view-journal').click();
  const cash=p.locator('#journal-cash-count'),diff=p.locator('#cash-difference');
  assert.equal(await p.locator('#cash-expected').innerText(),'30,000');assert.equal(await cash.inputValue(),'');assert.match(await diff.innerText(),/درج/);
  for(const [value,expected,kind] of [['28000','2,000 کمی','cash-short'],['32000','2,000 زیادہ','cash-extra'],['30000','حساب برابر ✓','cash-equal'],['0','30,000 کمی','cash-short']]){await cash.fill(value);assert.equal(await diff.innerText(),expected);assert(await diff.evaluate((e,c)=>e.classList.contains(c),kind));}
  await cash.fill('bad');assert.equal(await cash.getAttribute('aria-invalid'),'true');assert.match(await diff.innerText(),/درست/);
  await cash.fill('۲۸۰۰۰');await cash.blur();assert.equal(await cash.inputValue(),'28,000');await p.reload();assert.equal(await cash.inputValue(),'28,000');assert.equal(await diff.innerText(),'2,000 کمی');
  await p.locator('#journal-date').fill('2026-10-19');assert.equal(await cash.inputValue(),'');assert.equal(await p.locator('#cash-opening').innerText(),'30,000');await cash.fill('31000');await cash.blur();
  await p.locator('#journal-date').fill('2026-10-18');assert.equal(await cash.inputValue(),'28,000');
  await p.locator('[data-journal="credit"]').first().fill('90000');assert.equal(await p.locator('#cash-expected').innerText(),'20,000');assert.equal(await diff.innerText(),'8,000 زیادہ');await p.locator('[data-journal="credit"]').first().fill('100000');
  async function downloadFile(button,target){
   if(app){
    await app.evaluate(({BrowserWindow},target)=>{const wc=BrowserWindow.getAllWindows()[0].webContents;global.cashDownload=new Promise((resolve,reject)=>wc.session.once('will-download',(_event,item)=>{item.setSavePath(target);item.once('done',(_event,state)=>state==='completed'?resolve():reject(Error(state)));}));},target);
    await p.locator(button).click();await app.evaluate(()=>global.cashDownload);
   }else{const download=p.waitForEvent('download');await p.locator(button).click();await(await download).saveAs(target);}
  }
  console.log('CALCULATIONS PASS');await p.locator('.more-menu summary').click();const backup=path.join(base,'backup.json');await downloadFile('#backup',backup);const snapshot=JSON.parse(fs.readFileSync(backup));assert.equal(snapshot.journal.cashCounts['2026-10-18'],'28,000');assert.equal(snapshot.journal.cashCounts['2026-10-19'],'31,000');
  console.log('BACKUP SAVED');await cash.fill('123');await p.locator('#file').setInputFiles(backup);await p.waitForFunction(()=>!document.body.inert&&document.getElementById('file').value==='');assert.equal(await cash.inputValue(),'28,000');
  await downloadFile('#export-open',path.join(base,'summary.xlsx'));
  const excel=fs.readFileSync(path.join(base,'summary.xlsx'),'utf8');assert(excel.includes('28000'));assert(excel.includes('2,000 کمی'));
  await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(base,'desktop.png'),fullPage:true});
  if(browser){await p.setViewportSize({width:390,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.screenshot({path:path.join(base,'mobile.png'),fullPage:true});await p.setViewportSize({width:1366,height:1000});await p.emulateMedia({media:'print'});await p.evaluate(()=>dispatchEvent(new Event('beforeprint')));assert.equal(await p.locator('#cash-count-print').innerText(),'28,000');assert(await cash.isHidden());await p.pdf({path:path.join(base,'summary.pdf'),preferCSSPageSize:true,printBackground:true});await p.screenshot({path:path.join(base,'print.png'),fullPage:true});}
  if(app){await p.evaluate(()=>dispatchEvent(new Event('beforeprint')));const pdf=await app.evaluate(async({BrowserWindow})=>Array.from(await BrowserWindow.getAllWindows()[0].webContents.printToPDF({preferCSSPageSize:true,printBackground:true})));fs.writeFileSync(path.join(base,'summary.pdf'),Buffer.from(pdf));console.log('RUNTIME',await app.evaluate(({app})=>app.getVersion()));}
  assert.deepEqual(errors,[]);console.log('PASS cash summary: arithmetic, short/extra/equal, zero vs blank, invalid input, Urdu digits, per-date reload, carry-forward, entry edits, backup/restore and export.');console.log('EVIDENCE',base);
 }finally{if(app)await app.close();if(browser)await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
