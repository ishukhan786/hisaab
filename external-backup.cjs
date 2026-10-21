'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
class ExternalBackup{
 constructor(userData){this.settingsFile=path.join(userData,'external-backup.json');this.queue=Promise.resolve();}
 async status(){try{return JSON.parse(await fs.readFile(this.settingsFile,'utf8'));}catch(e){if(e.code==='ENOENT')return {folder:null,lastSuccess:null};throw e;}}
 async settings(value){
  await fs.mkdir(path.dirname(this.settingsFile),{recursive:true});
  const temp=this.settingsFile+'.tmp-'+randomUUID();
  try{
   await fs.writeFile(temp,JSON.stringify(value),{flag:'wx'});
   try{
    await fs.rename(temp,this.settingsFile);
   }catch(_){
    await fs.copyFile(temp,this.settingsFile);
    await fs.unlink(temp).catch(()=>{});
   }
  }finally{
   await fs.unlink(temp).catch(()=>{});
  }
 }
 run(fn){const job=this.queue.then(fn);this.queue=job.catch(()=>{});return job;}
 configure(folder){return this.run(async()=>{
  if(!folder){await this.settings({folder:null,lastSuccess:null});return this.status();}
  const resolved=path.resolve(folder);
  const stat=await fs.stat(resolved);
  if(!stat.isDirectory())throw Error('Folder unavailable');
  await this.settings({folder:resolved,lastSuccess:null});
  return this.status();
 });}
 save(data){return this.run(async()=>{
  const config=await this.status();
  if(!config.folder)return {status:'disabled',...config};
  let temp;
  try{
   // Never recreate a missing selected USB/sync root at a different location.
   if(!(await fs.stat(config.folder)).isDirectory())throw Error('Folder unavailable');
   const office=['satwa','city'].includes(data?.officeId)?data.officeId:null;
   const dir=path.join(config.folder,'Hisaab-Backups',...(office?[office]:[]));
   await fs.mkdir(dir,{recursive:true});
   const stamp=new Date().toISOString(),name='hisaab-auto-'+stamp.replace(/[:.]/g,'-')+'-'+randomUUID()+'.json';
   temp=path.join(dir,'.tmp-'+randomUUID());
   const handle=await fs.open(temp,'wx');
   try{
    await handle.writeFile(JSON.stringify(data,null,2),'utf8');
    await handle.sync();
   }finally{
    await handle.close();
   }
   try{
    await fs.rename(temp,path.join(dir,name));
   }catch(_){
    await fs.copyFile(temp,path.join(dir,name));
    await fs.unlink(temp).catch(()=>{});
   }
   temp=null;
   const next={...config,lastSuccess:stamp,error:null};
   await this.settings(next);
   const files=(await fs.readdir(dir)).filter(n=>/^hisaab-auto-\d{4}-\d{2}-\d{2}T[\dTZ-]+-[0-9a-f-]{36}\.json$/.test(n)).sort();
   for(const old of files.slice(0,Math.max(0,files.length-30)))await fs.unlink(path.join(dir,old)).catch(()=>{});
   return {status:'saved',...next};
  }catch(e){
   if(temp)await fs.unlink(temp).catch(()=>{});
   const next={...config,error:e.message};
   await this.settings(next).catch(()=>{});
   return {status:'error',...next};
  }
 });}
}
module.exports={ExternalBackup};
