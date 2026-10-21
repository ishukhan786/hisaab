'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
async function fixture(config){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',childElementCount:0});return nodes.get(id);};
 let props;
 const clerk={session:null,load:async()=>{},mountSignIn:(container,options)=>{props=options;},addListener:()=>{}};
 const window={fetch:async()=>({ok:true,json:async()=>config}),Clerk:clerk};
 const document={getElementById:node,querySelectorAll:()=>[],createElement:()=>({setAttribute:()=>{}}),head:{append:script=>queueMicrotask(()=>script.onload())}};
 vm.runInNewContext(fs.readFileSync('clerk-web.js','utf8'),{window,document,location:{protocol:'http:',origin:'http://fixture.test'},atob:s=>Buffer.from(s,'base64').toString(),alert:()=>{}});
 try{await window.HisaabAuth.ready;}catch{await Promise.resolve();}
 return {api:window.HisaabAuth,nodes,props};
}
(async()=>{
 const config={provider:'clerk',ready:true,allowSignUp:true,publishableKey:'pk_test_'+Buffer.from('fixture.clerk.accounts.dev$').toString('base64')};
 const normal=await fixture(config);assert.equal(normal.props.withSignUp,false);assert.equal(normal.props.appearance.elements.footerAction.display,'none');
 assert.equal(normal.nodes.get('pin-unlock-form').hidden,true);assert.equal(normal.nodes.get('clerk-login-panel').hidden,false);
 const missing=await fixture({...config,ready:false});assert.equal(missing.nodes.get('pin-unlock-form').hidden,true);assert(missing.nodes.get('clerk-login-error').textContent);
 const legacy=await fixture({provider:'pin'});assert.equal(legacy.api.provider,'clerk');assert.equal(legacy.nodes.get('pin-unlock-form').hidden,true);assert(legacy.nodes.get('clerk-login-error').textContent);
 console.log('PASS login-only browser wiring, signup disabled despite config override, missing configuration and no PIN fallback (isolated Clerk stub).');
})().catch(e=>{console.error(e);process.exitCode=1;});
