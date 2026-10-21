'use strict';
const assert=require('node:assert/strict');
const {createAccess}=require('../branch-access.cjs');
let value;
const Setting={findOne:async()=>value===undefined?null:{value},findOneAndUpdate:async(q,u)=>{
 if(u.$setOnInsert){if(value===undefined)value=u.$setOnInsert.value;return {value};}
 if(q.value!==value)return null;value=u.$set.value;return {value};
}};
(async()=>{
 const access=createAccess(Setting);assert.equal((await access.read()).data.branches[0].id,'mussafah');
 const added=await access.addBranch('New UAE Branch',0);assert.match(added.branch.id,/^office_[a-f0-9]{24}$/);
 await assert.rejects(access.addBranch(' new UAE branch ',1),/already exists/);
 await assert.rejects(access.addBranch('Another',0),/Settings changed/);
 await access.assign('user_staff',added.branch.id,true,1);
 assert.equal((await access.read()).data.users.user_staff.branch,added.branch.id);
 await access.assign('user_staff','city',false,2);
 assert.equal((await access.read()).data.users.user_staff.enabled,false);
 await assert.rejects(access.assign('user_other','unknown',true,3),/valid branch/);
 const results=await Promise.allSettled([access.addBranch('Race A',3),access.addBranch('Race B',3)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await access.read()).data.revision,4);
 console.log('PASS dynamic branches, unique names, assignment/revocation and concurrent settings writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
