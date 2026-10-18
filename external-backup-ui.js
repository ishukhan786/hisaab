/* Optional external snapshots. Primary storage remains independent. */
(()=>{
 'use strict';const native=window.electronAPI?.externalBackup;let config={folder:null,lastSuccess:null},handle=null,chain=Promise.resolve(),snapshot;
 const $=id=>document.getElementById(id);
 const run=fn=>{const job=chain.then(fn);chain=job.catch(()=>{});return job;};
 async function record(value){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('hisaab-external-backup',1);r.onupgradeneeded=()=>r.result.createObjectStore('config');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('config',value===undefined?'readonly':'readwrite'),store=tx.objectStore('config');let result;const r=value===undefined?store.get('selected'):store.put(value,'selected');r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
 function paint(){const text=config.folder?`بیرونی بیک اَپ: ${config.folder} — ${config.lastSuccess?'آخری کامیاب: '+new Date(config.lastSuccess).toLocaleString('en-GB'):'ابھی بیک اَپ نہیں بنا'}${config.error?' — محفوظ نہیں ہوا؛ فولڈر جوڑ کر دوبارہ کوشش کریں':''}`:'بیرونی بیک اَپ بند ہے؛ USB یا synced فولڈر منتخب کریں۔';for(const id of ['external-backup-status','external-backup-banner']){const e=$(id);if(e){e.textContent=text;e.classList.toggle('error',!!config.error);}}if($('external-backup-retry'))$('external-backup-retry').hidden=!config.folder;if($('external-backup-disable'))$('external-backup-disable').hidden=!config.folder;}
 async function persist(){if(!native)await record({handle,config});}
 const ready=(async()=>{try{if(native)config=await native.status();else{const saved=await record();if(saved){handle=saved.handle;config=saved.config;}}}catch{config.error='Settings unavailable';}paint();})();
 async function write(data){await ready;return run(async()=>{if(!config.folder)return {status:'disabled'};try{
  if(native){const result=await native.save(data);config={folder:result.folder,lastSuccess:result.lastSuccess,error:result.error};paint();return result;}
  if(!handle||await handle.queryPermission({mode:'readwrite'})!=='granted')throw Error('Permission required');
  const dir=await handle.getDirectoryHandle('Hisaab-Backups',{create:true}),stamp=new Date().toISOString(),name='hisaab-auto-'+stamp.replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.json';
  const file=await dir.getFileHandle(name,{create:true});let writer;try{writer=await file.createWritable();await writer.write(JSON.stringify(data,null,2));await writer.close();}catch(e){if(writer)await writer.abort().catch(()=>{});await dir.removeEntry(name).catch(()=>{});throw e;}
  config={...config,lastSuccess:stamp,error:null};await persist();
  const files=[];for await(const [name,item] of dir.entries())if(item.kind==='file'&&/^hisaab-auto-\d{4}-\d{2}-\d{2}T[\dTZ-]+-[0-9a-f-]{36}\.json$/.test(name))files.push(name);
  files.sort();for(const old of files.slice(0,Math.max(0,files.length-30)))await dir.removeEntry(old).catch(()=>{});
  paint();return {status:'saved'};
 }catch(e){config.error=e.message;await persist().catch(()=>{});paint();return {status:'error'};}});}
 window.HisaabExternalBackup={save:write,init(getSnapshot){snapshot=getSnapshot;
  const choose=$('external-backup-select');choose.disabled=!native&&!window.showDirectoryPicker;
  if(choose.disabled)$('external-backup-help').textContent='اس براؤزر میں فولڈر بیک اَپ دستیاب نہیں۔ Chrome / Edge میں HTTPS پر کھولیں، یا JSON بیک اَپ ڈاؤن لوڈ کریں۔';
  choose.onclick=async()=>{try{let selected;if(native)selected=await native.select();else{const directory=await window.showDirectoryPicker({mode:'readwrite'});selected={folder:directory.name,lastSuccess:null};await run(async()=>{handle=directory;config=selected;await persist();});}if(selected.cancelled)return;config=selected;paint();await write(snapshot());}catch(e){if(e.name!=='AbortError'){config.error=e.message;paint();}}};
  $('external-backup-retry').onclick=async()=>{try{if(!native&&handle)await handle.requestPermission({mode:'readwrite'});await write(snapshot());}catch(e){config.error=e.message;paint();}};
  $('external-backup-disable').onclick=async()=>{try{await ready;await run(async()=>{if(native)config=await native.disable();else{handle=null;config={folder:null,lastSuccess:null};await persist();}paint();});}catch(e){config.error=e.message;paint();}};
  ready.then(paint);
 }};
})();
