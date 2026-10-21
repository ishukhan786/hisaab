'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {loadLocalClerkConfig}=require('../scripts/local-clerk-config.cjs');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'hisaab-local-auth-'));
try{
 fs.writeFileSync(path.join(directory,'owner.json'),JSON.stringify({userId:'user_fixtureOwner'}));
 fs.writeFileSync(path.join(directory,'branches.json'),JSON.stringify({satwa:'org_fixture'}));
 const env={};loadLocalClerkConfig(env,directory);assert.equal(env.CLERK_OWNER_USER_IDS,'user_fixtureOwner');assert.equal(env.CLERK_ORG_SATWA,'org_fixture');
 for(const environment of [{NODE_ENV:'production'},{NODE_ENV:'test'},{VERCEL:'1'}]){loadLocalClerkConfig(environment,directory);assert.equal(environment.CLERK_OWNER_USER_IDS,undefined);}
 fs.writeFileSync(path.join(directory,'owner.json'),JSON.stringify({userId:'invalid'}));const invalid={};loadLocalClerkConfig(invalid,directory);assert.equal(invalid.CLERK_OWNER_USER_IDS,undefined);
 console.log('PASS shared local server mappings and production/test isolation.');
}finally{for(const filename of ['owner.json','branches.json'])fs.unlinkSync(path.join(directory,filename));fs.rmdirSync(directory);}
