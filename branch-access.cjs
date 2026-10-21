'use strict';
const crypto=require('node:crypto');
const defaults=[{id:'mussafah',name:'Mussafah Branch'},{id:'satwa',name:'Satwa Branch'},{id:'city',name:'City Branch'}];
const key='branch_access_v1';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
function createAccess(Setting){
 async function read(){
  const doc=await Setting.findOne({key});
  const data=doc?JSON.parse(doc.value):{revision:0,branches:structuredClone(defaults),users:{}};
  if(!Array.isArray(data.branches)||!data.users||!Number.isInteger(data.revision))throw fail('Branch settings unavailable',503);
  return {raw:doc?.value,data};
 }
 async function mutate(revision,change){
  const {raw,data}=await read();
  if(revision!==data.revision)throw fail('Settings changed. Refresh and try again.',409);
  const result=change(data);data.revision++;
  const value=JSON.stringify(data);
  if(raw===undefined){
   const doc=await Setting.findOneAndUpdate({key},{$setOnInsert:{key,value}},{upsert:true,returnDocument:'after'});
   if(doc.value!==value)throw fail('Settings changed. Refresh and try again.',409);
  }else{
   const doc=await Setting.findOneAndUpdate({key,value:raw},{$set:{value}},{returnDocument:'after'});
   if(!doc)throw fail('Settings changed. Refresh and try again.',409);
  }
  return {revision:data.revision,...result};
 }
 return {
  read,
  addBranch(name,revision){
   if(typeof name!=='string'||name.trim().length<2||name.trim().length>80)throw fail('Branch name must contain 2 to 80 characters.');
   name=name.trim();
   return mutate(revision,data=>{
    if(data.branches.length>=100)throw fail('Branch limit reached.');
    if(data.branches.some(b=>b.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw fail('This branch name already exists.',409);
    const branch={id:'office_'+crypto.randomBytes(12).toString('hex'),name};data.branches.push(branch);return {branch};
   });
  },
  assign(userId,branch,enabled,revision){
   if(!/^user_[a-zA-Z0-9]+$/.test(userId)||typeof enabled!=='boolean')throw fail('Invalid user assignment.');
   return mutate(revision,data=>{
    if(!data.branches.some(b=>b.id===branch))throw fail('Select a valid branch.');
    data.users[userId]={branch,enabled,updatedAt:new Date().toISOString()};return {userId};
   });
  }
 };
}
module.exports={createAccess,defaults};
