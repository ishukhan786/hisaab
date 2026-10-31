const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
const b=await chromium.launch({channel:'msedge',headless:true});
try{
const p=await b.newPage({viewport:{width:1500,height:1000}});
const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
async function menuClick(id){if(!await p.locator('.more-menu').evaluate(e=>e.open))await p.locator('.more-menu summary').click();await p.locator(id).click();if(await p.locator('.more-menu').evaluate(e=>e.open) && !await p.locator('dialog[open]').count())await p.locator('.more-menu summary').click();}
async function rangeFill(id,value){if(!await p.locator('#range-drawer').isVisible())await p.locator('#toggle-range').click();await p.locator(id).fill(value);}
const url=pathToFileURL(path.resolve('index.html')).href;
await p.goto(url);
const old={version:1,title:'Test register',date:'2026-10-15',fontSize:13,rows:[{sender:'Old customer',mobile:'۰۳۰۰۱۲۳۴۵۶۷',receiver:'Receiver',place:'Dubai',branch:' Alpha ',balance:'10',aed:'125.00',pkr:'1000'}]};
await p.evaluate(data=>localStorage.setItem('hisaab-register-v1',JSON.stringify(data)),old);await p.reload();
const saved=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('hisaab-register-v1')));
assert.equal((await saved()).version,4);
assert.equal((await saved()).rows[0].entryDate,'2026-10-15');
assert.equal((await saved()).rows[0].mobile,'03001234567');
assert.deepEqual((await saved()).branches,['Alpha']);

// Verify changing working date does NOT mutate historical entry's date
await p.locator('#date').fill('2026-10-10');
assert.equal((await saved()).rows[0].entryDate,'2026-10-15');
// In day view for 2026-10-10, the 2026-10-15 entry should not be visible
assert.match(await p.locator('#count').innerText(),/^0 /);

// Toggling "all dates" makes historical entry visible regardless of working date
await p.locator('#all-dates').check();
assert.match(await p.locator('#count').innerText(),/^1 /);
assert.equal(await p.locator('#rows .row-date').first().innerText(),'15/10/2026');

// Search filtering across all dates
await p.locator('#search').fill('۰۳۰۰');assert.match(await p.locator('#count').innerText(),/^1 /);
await p.locator('#search').fill('missing');assert.match(await p.locator('#count').innerText(),/^0 /);
await menuClick('#reset-filters');
assert.equal(await p.locator('#all-dates').isChecked(),false);

// Date range filters
await rangeFill('#date-from','2026-10-11');
await rangeFill('#date-to','2026-10-16');
assert.match(await p.locator('#count').innerText(),/^1 /);
await rangeFill('#date-to','2026-10-09');
assert(await p.locator('#filter-message').evaluate(e=>e.classList.contains('error')));
await menuClick('#reset-filters');

// Daily summary dialog
await p.locator('#summary-open').click();
assert(await p.locator('#summary-dialog').evaluate(e=>e.open));
assert.equal(await p.locator('#summary-rows tr').count(),1);
assert.equal(await p.locator('#summary-balance').innerText(),'10');
assert.equal(await p.locator('#summary-aed').innerText(),'125');
assert.equal((await p.locator('#summary-pkr').innerText()).replace(/\s+/g,' '),'1,000 روپیہ');
// Clicking summary row jumps to that day
await p.locator('#summary-rows tr').first().click();
assert.equal(await p.locator('#summary-dialog').evaluate(e=>e.open),false);
assert.equal(await p.locator('#date').inputValue(),'2026-10-15');
assert.match(await p.locator('#count').innerText(),/^1 /);

// Manage parties
await menuClick('#manage-branches');
await p.locator('#branch-name').fill('Beta');
await p.locator('#branch-form button').click();
assert.deepEqual((await saved()).branches,['Alpha','Beta']);
await menuClick('#manage-branches');await p.locator('#branch-name').fill('  beta  ');
await p.locator('#branch-form button').click();
assert.equal((await saved()).branches.length,2);
await p.locator('#close-branches').click();

// Select Beta party and enter new row on date 2026-10-12 at the BOTTOM
await p.locator('#date').fill('2026-10-12');
await p.getByRole('tab').filter({hasText:'Beta'}).click();
let draft=p.locator('#rows tr:not([hidden])').last(); // Draft row is at the bottom!
await draft.locator('[data-field="sender"]').fill('New sender');
let active=p.locator('#rows tr:not([hidden])').first();
await active.locator('[data-field="mobile"]').fill('+٩٧١ ٥٠ ١٢٣٤٥٦٧');
await active.locator('[data-field="aed"]').fill('۲۴');
assert.equal(await p.locator('#total-aed').innerText(),'24');

// Press Tab on PKR: focuses the new draft row at the bottom!
await active.locator('[data-field="pkr"]').press('Tab');
assert(await p.locator('#rows tr:not([hidden])').last().locator('[data-field="sender"]').evaluate(e=>e===document.activeElement));
assert.equal(await p.locator('#rows tr:not([hidden])').last().locator('[data-field="branch"]').inputValue(),'Beta');

// Old customer is at index 0, new entry is at the bottom (index 1)
assert.equal((await saved()).rows[0].sender,'Old customer');
assert.equal((await saved()).rows[1].sender,'New sender');
assert.equal((await saved()).rows[0].entryDate,'2026-10-15');
assert.equal((await saved()).rows[1].entryDate,'2026-10-12');

// Rename branch
await menuClick('#manage-branches');
const items=p.locator('.party-item');
await items.nth(1).locator('input').fill('Gamma');
await items.nth(1).locator('button').first().click();
assert.equal((await saved()).rows.find(r=>r.sender==='New sender').branch,'Gamma');
assert.equal(await p.locator('#branch-filter').inputValue(),'b:Gamma');
await items.nth(1).locator('button').last().click();
assert((await saved()).branches.includes('Gamma'));
await p.locator('#close-branches').click();

// Delete and Undo
const newSenderRow=p.locator('#rows tr:not([hidden])').first();
assert.equal(await newSenderRow.locator('[data-field="sender"]').inputValue(),'New sender');
await newSenderRow.locator('.delete').click();
assert.equal((await saved()).trash.length,1);
assert.equal(await p.locator('#total-aed').innerText(),'0');
await p.reload();
await p.locator('#undo').click();
assert.equal((await saved()).trash.length,0);
assert.equal((await saved()).rows.filter(r=>r.sender==='New sender').length,1);

// Date range filtering
await p.getByRole('tab').filter({hasText:'Gamma'}).click();
await rangeFill('#date-from','2026-10-12');
await rangeFill('#date-to','2026-10-12');
assert.equal(await p.locator('#total-aed').innerText(),'24');

// Excel exports
await p.locator('#export-open').click();
let dl=p.waitForEvent('download');
await p.locator('#export-filtered').click();
await (await dl).saveAs(path.resolve('tests/filtered.xlsx'));
await p.locator('#export-open').click();
dl=p.waitForEvent('download');
await p.locator('#export-all').click();
await (await dl).saveAs(path.resolve('tests/all.xlsx'));

// Backup download via more-menu
await p.locator('.more-menu summary').click();
dl=p.waitForEvent('download');
await p.locator('#backup').click();
await (await dl).saveAs(path.resolve('tests/backup.json'));
assert((await saved()).lastBackupAt);
assert(!(await p.locator('#backup-banner').evaluate(e=>e.classList.contains('backup-due'))));
await p.locator('.more-menu summary').click();

// Print emulation and PDF output
await p.emulateMedia({media:'print'});
await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
assert.equal(await p.locator('#rows tr:not(.empty-row)').count(),1);
assert.equal(await p.locator('th.no-print').first().evaluate(e=>getComputedStyle(e).display),'none');
assert.equal(await p.locator('#total-aed').innerText(),'24');
await p.pdf({path:'tests/filtered-print.pdf',preferCSSPageSize:true});
await p.emulateMedia({media:'screen'});
await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));

// Mobile responsiveness & layout
await menuClick('#reset-filters');
await p.evaluate(()=>document.fonts.ready);
await p.screenshot({path:'ui-desktop.png',fullPage:true});
await p.setViewportSize({width:390,height:844});
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await p.screenshot({path:'ui-mobile.png',fullPage:true});

// Restore backup test
await p.setInputFiles('#file',path.resolve('tests/backup.json'));
await p.waitForTimeout(150);
assert.equal((await saved()).rows.filter(r=>r.sender).length,2);

// Broken file restore protection
const before=JSON.stringify(await saved());
await p.setInputFiles('#file',{name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"version":2,"rows":[]}')});
await p.waitForTimeout(150);
assert.equal(JSON.stringify(await saved()),before);

assert.deepEqual(errors,[]);
console.log('PASS: migration, date preservation, day/all-dates mode, daily summary dialog, search, parties, Tab/draft, Undo, XLSX export, more-menu backup/restore, print CSS & PDF, responsive layout.');
}finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1)});
