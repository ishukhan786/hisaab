'use strict';
// Independent mocked admin workspace. Never opens the user's signed-in browser.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  for(const width of [390,900,1366]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.setContent('<!doctype html><html><body><select id="office-select"><option value="mussafah">Mussafah Branch</option></select></body></html>');
   await page.addStyleTag({content:fs.readFileSync('ui.css','utf8')});
   await page.addScriptTag({content:fs.readFileSync('branch-admin-ui.js','utf8')});
   await page.evaluate(async()=>{
    window.fixture={revision:0,branches:[{id:'mussafah',name:'Mussafah Branch'},{id:'satwa',name:'Satwa Branch'}],total:2,users:[{id:'user_owner',username:'admin',owner:true},{id:'user_staff',username:'satwa_staff',assignment:{branch:'satwa',enabled:true}}]};
    window.calls=[];
    await window.HisaabBranchAdmin.open(async(url,options)=>{
     const body=options.body?JSON.parse(options.body):null;window.calls.push({url,body});
     if(body){if(url.endsWith('/branches')){const branch={id:'office_123456789012345678901234',name:body.name};window.fixture.branches.push(branch);window.fixture.revision++;return {ok:true,json:async()=>({branch})};}window.fixture.revision++;}
     return {ok:true,json:async()=>structuredClone(window.fixture)};
    },'mussafah');
   });
   assert(await page.getByRole('dialog').isVisible());
   await page.getByRole('textbox',{name:'New branch name',exact:true}).fill('Dubai Branch');
   await page.getByRole('button',{name:'Add branch',exact:true}).click();
   await page.getByText('Saved.',{exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Username',exact:true}).fill('dubai_staff');
   await page.getByRole('textbox',{name:'New user password',exact:true}).fill('fixture-only-long-password');
   await page.getByRole('button',{name:'Create user',exact:true}).click();
   await page.waitForFunction(()=>window.calls.some(c=>c.url==='/api/admin/users'));
   assert.equal(await page.getByRole('textbox',{name:'New user password',exact:true}).inputValue(),'');
   await page.getByRole('button',{name:'Save assignment',exact:true}).click();
   await page.waitForFunction(()=>window.calls.some(c=>c.url.includes('/assignment')));
   assert(await page.evaluate(()=>document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth+1));
   await page.getByRole('dialog').evaluate(dialog=>dialog.scrollTop=0);
   await page.screenshot({path:'scratch/branch-admin-preview-'+width+'.png'});
   if(width===900)await page.screenshot({path:'scratch/branch-admin-preview.png'});
   await page.getByRole('button',{name:'Close',exact:true}).click();assert(!await page.getByRole('dialog').isVisible());
   await page.close();
  }
  console.log('PASS admin branch/user forms, assignment requests, cleared password, modal controls and mobile/desktop layout (mocked workspace).');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
