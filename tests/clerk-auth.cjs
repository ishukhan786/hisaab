'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {sessionFor,publicConfig,config}=require('../clerk-auth.cjs');
const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const env={HISAAB_AUTH_PROVIDER:'clerk',CLERK_PUBLISHABLE_KEY:'pk_test_'+Buffer.from('hisaab-test.clerk.accounts.dev$').toString('base64'),CLERK_JWT_KEY:publicKey.export({type:'spki',format:'pem'}),CLERK_AUTHORIZED_PARTIES:'http://localhost:3000',CLERK_OWNER_USER_IDS:'user_owner',CLERK_ORG_MUSSAFAH:'org_mussafah',CLERK_ORG_SATWA:'org_satwa',CLERK_ORG_CITY:'org_city'};
function token(changes={}){
 const at=Math.floor(Date.now()/1000);const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'test-kid'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({sub:'user_staff',sid:'sess_test',iss:'https://hisaab-test.clerk.accounts.dev',azp:'http://localhost:3000',iat:at,nbf:at-1,exp:at+60,v:2,o:{id:'org_satwa',rol:'member'},...changes})).toString('base64url');
 const body=header+'.'+payload;return body+'.'+crypto.sign('RSA-SHA256',Buffer.from(body),privateKey).toString('base64url');
}
const request=value=>({headers:{authorization:'Bearer '+value}});
(async()=>{
 assert.equal(config({}).provider,'clerk');
 assert.equal(config({NODE_ENV:'production',HISAAB_AUTH_PROVIDER:'pin'}).provider,'clerk');
 assert.equal(publicConfig({...env,CLERK_ALLOW_DEVELOPMENT_SIGNUP:'true'}).allowSignUp,false);
 assert.equal(publicConfig({}).ready,false);
 const owner=await sessionFor(request(token({sub:'user_owner',o:undefined})),env);assert.equal(owner?.role,'owner');assert.equal(owner.branch,null);
 const staff=await sessionFor(request(token()),env);assert.equal(staff?.role,'staff');assert.equal(staff.branch,'satwa');
 assert.equal((await sessionFor(request(token({o:{id:'org_city',rol:'admin'}})),env)).role,'staff');
 assert.equal((await sessionFor(request(token({v:1,o:undefined,org_id:'org_mussafah'})),env)).branch,'mussafah');
 for(const claims of [{sub:'user_unassigned',o:undefined},{o:{id:'org_unknown',rol:'admin'}},{iss:'https://other.clerk.accounts.dev'},{azp:'https://untrusted.example'},{azp:undefined},{exp:1},{sts:'pending'},{sid:undefined}])assert.equal(await sessionFor(request(token(claims)),env),null,JSON.stringify(claims));
 const signed=token();assert.equal(await sessionFor(request(signed.slice(0,-4)+'aaaa'),env),null);
 assert.equal(await sessionFor(request('legacy-owner-token'),env),null);
 assert.equal(await sessionFor(request(token({sub:'user_owner',o:undefined})),{...env,CLERK_OWNER_USER_IDS:''}),null);
 assert.equal(await sessionFor(request(token()),{...env,CLERK_JWT_KEY:''}),null);
 const publicData=JSON.stringify(publicConfig({...env,CLERK_SECRET_KEY:'never-send-this-to-browser'}));assert(!publicData.includes('never-send'));assert(!publicData.includes('BEGIN PUBLIC KEY'));assert(!publicData.includes('user_owner'));
 console.log('PASS real Clerk SDK + RSA signatures: owner allowlist, fixed branch organizations, admin scope, v1/v2 claims, wrong issuer/origin, expiry, pending sessions, tampering, no PIN fallback and public config redaction.');
})().catch(e=>{console.error(e);process.exitCode=1;});
