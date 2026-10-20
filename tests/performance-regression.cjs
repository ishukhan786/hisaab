const {chromium,_electron}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const packaged=process.env.HISAAB_TEST_PACKAGED==='1';
  const browser=packaged?await _electron.launch({executablePath:path.resolve('dist/win-unpacked/حساب.exe'),args:['--user-data-dir='+path.resolve('scratch','performance-packaged-'+Date.now())]}):await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=packaged?await browser.firstWindow():await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    if(!packaged)await page.goto(pathToFileURL(path.resolve('index.html')).href);
    await page.locator('#rows').waitFor({state:'attached'});
    if(packaged)await browser.evaluate(({BrowserWindow},target)=>{BrowserWindow.getAllWindows()[0].webContents.session.on('will-download',(_,item)=>item.setSavePath(target));},path.resolve('scratch','performance-packaged.xlsx'));
    const rows=Array.from({length:450},(_,i)=>({id:'r'+i,entryDate:'2026-10-17',sender:'Customer '+i,mobile:'0300'+String(i).padStart(7,'0'),receiver:'Receiver',place:'Dubai',branch:'',balance:'10',aed:'100',pkr:'200',history:[]}));
    rows[449]={...rows[0],id:'r449'};
    const seed=async rows=>{await require('./seed-state.cjs')(page,{version:4,title:'Performance regression',date:'2026-10-17',branches:[],rows,trash:[]});await page.locator('#date').fill('2026-10-17');};
    await seed(rows);
    assert.equal(await page.locator('#rows tr:not(.draft-row)').count(),200);
    assert.equal(await page.locator('#total-aed').innerText(),'45,000');
    assert.match(await page.locator('[data-id="r0"] .dup-badge').getAttribute('title'),/#450/);
    await page.locator('[data-id="r199"] [data-field="pkr"]').press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.closest('tr').dataset.id),'r200');
    assert.equal(await page.locator('#rows .serial-num').first().innerText(),'201');
    await page.locator('#register-page-next').click();
    assert.equal(await page.locator('#rows .serial-num').first().innerText(),'401');
    assert.equal(await page.locator('#rows tr:not(.draft-row)').count(),50);
    await page.locator('[data-id="r449"] [data-field="sender"]').fill('Changed');
    assert.equal(await page.locator('[data-id="r449"] .dup-badge').count(),1);
    await page.locator('[data-id="r449"] [data-field="mobile"]').fill('03008888888');
    await page.locator('#register-page-prev').click();await page.locator('#register-page-prev').click();
    assert.equal(await page.locator('[data-id="r0"] .dup-badge').count(),0);
    await page.locator('#search').fill('Changed');
    assert.equal(await page.locator('#rows tr:not(.draft-row)').count(),1);
    assert.equal(await page.locator('#total-aed').innerText(),'100');
    await page.locator('#search').fill('');
    await page.locator('#register-page-next').click();
    await page.evaluate(()=>dispatchEvent(new Event('beforeprint')));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#rows tr:not(.empty-row)').count(),450);
    assert.equal(await page.locator('#rows tr:not(.empty-row) .print-value').count(),450*7);
    await page.evaluate(()=>dispatchEvent(new Event('afterprint')));
    assert.equal(await page.locator('#rows tr:not(.draft-row)').count(),200);
    assert.equal(await page.locator('#rows .serial-num').first().innerText(),'201');
    if(packaged){
      const pdf=await browser.evaluate(async({BrowserWindow})=>{
        const pdf=await BrowserWindow.getAllWindows()[0].webContents.printToPDF({printBackground:true,landscape:true,pageSize:'A4',preferCSSPageSize:true});
        return pdf.toString('base64');
      });
      require('fs').writeFileSync(path.resolve('scratch','performance-packaged.pdf'),Buffer.from(pdf,'base64'));
      assert.equal(await page.locator('#rows tr:not(.draft-row)').count(),200);
    }
    await page.evaluate(()=>{const create=HisaabExcel.create;HisaabExcel.create=rows=>{window.exportedRows=rows;return create(rows);};});
    await page.locator('#export-open').click();const download=packaged?Promise.resolve():page.waitForEvent('download');await page.locator('#export-filtered').click();await download;
    assert.equal(await page.evaluate(()=>window.exportedRows.length),452);
    // A fresh row at the bottom should stay visible when it becomes entry 451.
    await page.locator('#rows tr.draft-row [data-field="sender"]').fill('New entry');
    assert.equal(await page.locator('#rows .serial-num').first().innerText(),'401');
    assert.equal(await page.locator('#count').innerText(),'451 اندراجات');
    await page.locator('#register-page-label').scrollIntoViewIfNeeded();
    await page.screenshot({path:'scratch/performance-pagination'+(packaged?'-packaged':'')+'.png'});
    // Compare indexed warnings against the date/party/phone/amount rule,
    // including missing phones, negative amounts and normalized digits.
    const fixture=Array.from({length:100},(_,i)=>({...rows[i],sender:i%11===0?'':'Person '+i%9,mobile:i%3===0?'':i%3===1?'۰۳۰۰۱۲۳۴۵۶۷':'03009999999',balance:i%5===0?'-5':'0',aed:i%4===0?'۱۰۰':'0',pkr:i%7===0?'1,000':'0',entryDate:i<70?'2026-10-17':'2026-10-16'}));
    await seed(fixture);
    const digits=v=>v.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
    const amount=v=>BigInt(digits(v).replace(/[,\s]/g,'')||'0');
    for(let i=0;i<70;i++){
      const r=fixture[i],s=r.sender.toLowerCase(),m=digits(r.mobile).replace(/\D/g,''),money=['balance','aed','pkr'].map(k=>amount(r[k])),hasMoney=money.some(v=>v!==0n);
      const expected=fixture.findIndex((other,j)=>j!==i&&r.entryDate===other.entryDate&&r.branch===other.branch&&hasMoney&&(m.length>=7?digits(other.mobile).replace(/\D/g,'')===m:!m&&s&&!other.mobile&&other.sender.toLowerCase()===s)&&['balance','aed','pkr'].every((k,n)=>amount(other[k])===money[n]));
      const badge=page.locator(`[data-id="r${i}"] .dup-badge`);
      assert.equal(await badge.count(),expected<0?0:1,`duplicate row ${i}`);
      if(expected>=0)assert((await badge.getAttribute('title')).includes('#'+(expected+1)));
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: bounded rendering, paging/Tab, cross-page duplicates and edits, full totals/export/print, draft visibility, updated duplicate rules and no renderer errors.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
