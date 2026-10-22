/* Optional external snapshots. Primary storage remains independent. */
(()=>{
 'use strict';
 const native=window.electronAPI?.externalBackup;
 let config={folder:null,lastSuccess:null},handle=null,chain=Promise.resolve(),snapshot,working=0;
 const $=id=>document.getElementById(id);
 const run=fn=>{const job=chain.then(fn);chain=job.catch(()=>{});return job;};

 async function record(value){
  const db=await new Promise((resolve,reject)=>{
   const r=indexedDB.open('hisaab-external-backup',1);
   r.onupgradeneeded=()=>r.result.createObjectStore('config');
   r.onsuccess=()=>resolve(r.result);
   r.onerror=()=>reject(r.error);
  });
  try{
   return await new Promise((resolve,reject)=>{
    const tx=db.transaction('config',value===undefined?'readonly':'readwrite'),store=tx.objectStore('config');
    let result;
    const r=value===undefined?store.get('selected'):store.put(value,'selected');
    r.onsuccess=()=>{result=r.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(tx.error);
    tx.onabort=()=>reject(tx.error);
   });
  }finally{
   db.close();
  }
 }

 function cleanErrorMessage(msg){
  if(!msg)return '';
  let s=String(msg);
  s=s.replace(/^Error:\s*Error invoking remote method '[^']+':\s*(Error:\s*)?/i,'');
  s=s.replace(/^Error:\s*/i,'');
  return s.trim();
 }

 function paint(){
  const err=config.error?cleanErrorMessage(config.error):'';
  const at=config.lastSuccess?new Date(config.lastSuccess):null;
  const last=at&&Number.isFinite(at.getTime())?at.toLocaleString('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}):null;
  const folder=config.folder?(native?config.folder.replace(/[\\/]+$/,'')+'\\Hisaab-Backups':config.folder+'/Hisaab-Backups'):'فولڈر منتخب نہیں کیا گیا';
  const state=working?'بیک اَپ پر کام ہو رہا ہے…':err?'بیک اَپ ناکام — دوبارہ کوشش کریں':config.folder?(last?'بیرونی بیک اَپ محفوظ ہے ✓':'بیک اَپ ابھی نہیں بنا'):'بیرونی بیک اَپ بند ہے';
  const banner=$('external-backup-banner');banner.classList.toggle('error',!!err);banner.classList.toggle('backup-working',working>0);
  $('external-backup-state').textContent=state;
  const lastStatus=$('external-backup-last-success');lastStatus.replaceChildren(document.createTextNode('آخری کامیاب بیک اَپ: '));
  if(last){const stamp=document.createElement('time');stamp.dateTime=config.lastSuccess;stamp.dir='ltr';stamp.textContent=last;lastStatus.append(stamp);}else lastStatus.append('ابھی کوئی نہیں');
  const location=$('external-backup-location');location.textContent=folder;
  location.title=native?folder:'براؤزر مکمل ڈسک path فراہم نہیں کرتا؛ منتخب فولڈر کا نام دکھایا گیا ہے۔';
  const error=$('external-backup-error');error.hidden=!err;error.textContent=err?'وجہ: '+err+' — فولڈر یا USB جوڑ کر دوبارہ کوشش کریں۔':'';
  const details=$('external-backup-status');
  details.textContent=[state,last?'آخری کامیاب بیک اَپ: '+last:'','مقام: '+folder,err?'وجہ: '+err:''].filter(Boolean).join(' — ');
  details.classList.toggle('error',!!err);
  const badgeState=working?'working':err?'error':config.folder?(last?'ready':'pending'):'disabled';
  details.dataset.backupState=badgeState;
  document.getElementById('external-backup-state').dataset.backupState=badgeState;
  const supported=!!native||!!window.showDirectoryPicker;
  for(const id of ['external-backup-select'])$(id).disabled=!!working||!supported;
  for(const id of ['external-backup-retry']){
   $(id).hidden=!config.folder;$(id).disabled=!!working;
   $(id).textContent=err?'دوبارہ کوشش کریں':working?'بیک اَپ بن رہا ہے…':'ابھی بیک اَپ لیں';
  }
  $('external-backup-disable').hidden=!config.folder;$('external-backup-disable').disabled=!!working;
 }

 async function persist(){if(!native)await record({handle,config});}

 const ready=(async()=>{
  try{
   if(native)config=await native.status();
   else{const saved=await record();if(saved){handle=saved.handle;config=saved.config;}}
  }catch(err){
   config.error=cleanErrorMessage(err?.message||'Settings unavailable');
  }
  paint();
 })();

 async function write(data){
  await ready;
  return run(async()=>{
   if(!config.folder)return {status:'disabled'};
   working++;paint();
   try{
    if(native){
     const result=await native.save(data);
     config={folder:result.folder,lastSuccess:result.lastSuccess,error:result.error?cleanErrorMessage(result.error):null};
     paint();
     return result;
    }
    if(!handle||await handle.queryPermission({mode:'readwrite'})!=='granted')throw Error('Permission required');
    const root=await handle.getDirectoryHandle('Hisaab-Backups',{create:true});
    const dir=root,stamp=new Date().toISOString(),name='hisaab-auto-'+stamp.replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json';
    const file=await dir.getFileHandle(name,{create:true});let writer;try{writer=await file.createWritable();await writer.write(JSON.stringify(data,null,2));await writer.close();}catch(e){if(writer)await writer.abort().catch(()=>{});await dir.removeEntry(name).catch(()=>{});throw e;}
    config={...config,lastSuccess:stamp,error:null};await persist();
    const files=[];for await(const [name,item] of dir.entries())if(item.kind==='file'&&/^hisaab-auto-\d{4}-\d{2}-\d{2}T[\dTZ-]+-[0-9a-f-]{36}\.json$/.test(name))files.push(name);
    files.sort();for(const old of files.slice(0,Math.max(0,files.length-30)))await dir.removeEntry(old).catch(()=>{});
    paint();return {status:'saved'};
   }catch(e){
    config.error=cleanErrorMessage(e.message);
    await persist().catch(()=>{});
    paint();
    return {status:'error',error:config.error};
   }finally{working--;paint();}
  });
 }

 window.HisaabExternalBackup={save:write,init(getSnapshot){
  snapshot=getSnapshot;
  const choose=$('external-backup-select');
  choose.disabled=!native&&!window.showDirectoryPicker;
  if(choose.disabled)$('external-backup-help').textContent='اس براؤزر میں فولڈر بیک اَپ دستیاب نہیں۔ Chrome / Edge میں HTTPS پر کھولیں، یا JSON بیک اَپ ڈاؤن لوڈ کریں۔';

  choose.onclick=async()=>{
   if(working)return;
   working++;paint();
   try{
    await ready;
    let selected;
    if(native)selected=await native.select();
    else{
     const directory=await window.showDirectoryPicker({mode:'readwrite'});
     selected={folder:directory.name,lastSuccess:null};
     await run(async()=>{handle=directory;config=selected;await persist();});
    }
    if(selected&&selected.cancelled)return;
    if(!selected||!selected.folder)throw Error('فولڈر منتخب نہیں ہو سکا');
    config={...selected,error:null};
    paint();
    const saveRes=await write(snapshot());
    if(saveRes?.status==='error'&&saveRes?.error){
     config.error=cleanErrorMessage(saveRes.error);
     paint();
    }
   }catch(e){
    if(e.name!=='AbortError'){
     config.error=cleanErrorMessage(e.message);
     paint();
    }
   }finally{working--;paint();}
  };

  $('external-backup-retry').onclick=async()=>{
   if(working)return;
   working++;paint();
   try{
    await ready;
    if(!native&&handle)await handle.requestPermission({mode:'readwrite'});
    const res=await write(snapshot());
    if(res?.status==='error'&&res?.error){
     config.error=cleanErrorMessage(res.error);
     paint();
    }
   }catch(e){
    config.error=cleanErrorMessage(e.message);
    paint();
   }finally{working--;paint();}
  };

  $('external-backup-disable').onclick=async()=>{
   try{
    await ready;
    await run(async()=>{
     if(native)config=await native.disable();
     else{handle=null;config={folder:null,lastSuccess:null};await persist();}
     paint();
    });
   }catch(e){
    config.error=cleanErrorMessage(e.message);
    paint();
   }
  };

  ready.then(paint);
 }};
})();
