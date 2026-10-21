'use strict';
const {verifyToken}=require('@clerk/backend');
const officeIds=['mussafah','satwa','city'];
function config(env=process.env){
 // Web deployments never fall back to shared PIN authentication.
 const provider=env.NODE_ENV==='test'&&env.HISAAB_AUTH_PROVIDER==='pin'?'pin':'clerk';
 const publishableKey=(env.CLERK_PUBLISHABLE_KEY||'').trim();
 const jwtKey=(env.CLERK_JWT_KEY||'').replace(/\\n/g,'\n').trim();
 const secretKey=(env.CLERK_SECRET_KEY||'').trim();
 let host='';
 if(/^pk_(test|live)_/.test(publishableKey))host=Buffer.from(publishableKey.replace(/^pk_(test|live)_/,''),'base64').toString().replace(/\$$/,'');
 if(!/^[a-zA-Z0-9.-]+$/.test(host))host='';
 const issuer=host?'https://'+host:'';
 const origins=(env.CLERK_AUTHORIZED_PARTIES||'http://localhost:3000,http://127.0.0.1:3000').split(',').map(s=>s.trim()).filter(Boolean);
 const ownerIds=(env.CLERK_OWNER_USER_IDS||'').split(',').map(s=>s.trim()).filter(s=>/^user_[a-zA-Z0-9]+$/.test(s));
 const orgs=Object.fromEntries(officeIds.map(id=>[id,(env['CLERK_ORG_'+id.toUpperCase()]||'').trim()]));
 return {provider,publishableKey,jwtKey,secretKey,issuer,origins,ownerIds,orgs,ready:!!(issuer&&(jwtKey||secretKey)&&origins.length)};
}
function publicConfig(env=process.env){
 const c=config(env);
 return {provider:c.provider,publishableKey:c.publishableKey,ready:c.provider==='pin'||c.ready,organizations:c.orgs,allowSignUp:false};
}
async function sessionFor(req,env=process.env,resolveAccess){
 const c=config(env);if(!c.ready)return null;
 const header=req.headers.authorization||'';if(!header.startsWith('Bearer '))return null;
 try{
  const claims=await verifyToken(header.slice(7),{jwtKey:c.jwtKey||undefined,secretKey:c.secretKey||undefined,issuer:c.issuer,authorizedParties:c.origins});
  if(!claims.sid||!claims.sub||claims.sts==='pending'||!c.origins.includes(claims.azp))return null;
  if(c.ownerIds.includes(claims.sub))return {account:claims.sub,userId:claims.sub,role:'owner',branch:null,provider:'clerk'};
  if(resolveAccess){
   const access=await resolveAccess(claims.sub);
   if(access!==undefined)return access?.enabled?{account:claims.sub,userId:claims.sub,role:'staff',branch:access.branch,provider:'clerk'}:null;
  }
  const org=claims.o?.id||claims.org_id;
  const branch=officeIds.find(id=>c.orgs[id]&&c.orgs[id]===org);
  if(!branch)return null;
  return {account:claims.sub,userId:claims.sub,role:'staff',branch,provider:'clerk'};
 }catch{return null;}
}
module.exports={config,publicConfig,sessionFor};
