'use strict';
const fs=require('node:fs'),path=require('node:path');
function loadLocalClerkConfig(env=process.env,directory=path.resolve(__dirname,'../.clerk')){
 // Machine-local development mappings must never change deployed/test permissions.
 if(env.NODE_ENV==='production'||env.NODE_ENV==='test'||env.VERCEL)return;
 for(const [filename,apply]of [
  ['branches.json',map=>{for(const id of ['mussafah','satwa','city'])if(map[id])env['CLERK_ORG_'+id.toUpperCase()]=map[id];}],
  ['owner.json',data=>{if(/^user_[a-zA-Z0-9]+$/.test(data.userId))env.CLERK_OWNER_USER_IDS=data.userId;}]
 ]){
  const file=path.join(directory,filename);
  if(fs.existsSync(file))apply(JSON.parse(fs.readFileSync(file,'utf8')));
 }
}
module.exports={loadLocalClerkConfig};
