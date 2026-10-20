const {chromium,_electron}=require('playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
  const packaged=process.env.HISAAB_TEST_PACKAGED==='1';
  const browser=packaged?await _electron.launch({executablePath:path.resolve('dist/win-unpacked/حساب.exe'),args:['--user-data-dir='+path.resolve('scratch','restore-history-'+Date.now())]}):await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=packaged?await browser.firstWindow():await browser.newPage();
    if(packaged){
      assert.equal(await browser.evaluate(({app})=>app.getVersion()),require('../package.json').version);
      await browser.evaluate(({ipcMain})=>{ipcMain.removeHandler('save-auto-backup');ipcMain.handle('save-auto-backup',()=>({status:'error'}));});
    }
    const alerts=[];
    page.on('dialog',async d=>{if(d.type()==='alert')alerts.push(d.message());await d.accept();});
    if(!packaged)await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await page.locator('#rows').waitFor({state:'attached'});
    const key='hisaab-register-v1';
    const sender=()=>page.locator('[data-field="sender"]').first();
    const saved=()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
    await sender().fill('Original');await sender().blur();
    await page.reload();
    await sender().fill('Edited');await sender().blur();
    await page.reload();
    assert.deepEqual((await saved()).rows[0].history.map(h=>[h.from,h.to]),[['','Original'],['Original','Edited']]);
    const replacement=await saved();replacement.rows[0].sender='RESTORED';
    const restore=async()=>{
      await page.locator('#file').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(replacement))});
      await page.waitForFunction(()=>!document.body.inert&&document.getElementById('file').value==='');
    };
    for(const failure of ['safety','save']){
      await page.evaluate(mode=>{
        const original=Storage.prototype.setItem;
        window.electronAPI={saveAutoBackup:async()=>({status:'error'})};
        Storage.prototype.setItem=function(k,v){
          if(mode==='safety'&&k==='hisaab-safety-pre-restore'||mode==='save'&&k==='hisaab-register-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
          return original.call(this,k,v);
        };
      },failure);
      const before=JSON.stringify(await saved()),count=alerts.length;
      await restore();
      assert.equal(alerts.length,count+1);
      assert.equal(await sender().inputValue(),'Edited');
      assert.equal(JSON.stringify(await saved()),before);
      if(failure==='save')assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hisaab-safety-pre-restore')).rows[0].sender),'Edited');
      await page.reload();assert.equal(await sender().inputValue(),'Edited');
    }
    await restore();assert.equal(await sender().inputValue(),'RESTORED');
    await page.reload();assert.equal(await sender().inputValue(),'RESTORED');
    console.log('PASS: edit history survives reload; failed safety backup and failed restore write preserve current data; successful restore survives reload.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
