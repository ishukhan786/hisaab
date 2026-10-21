/* Clerk is only loaded in the web app. Electron keeps local authentication. */
(()=>{
 'use strict';
 if(window.electronAPI||!location.protocol.startsWith('http'))return;
 const $=id=>document.getElementById(id);
 $('pin-unlock-form').hidden=true;
 $('clerk-login-panel').hidden=false;
 let config,clerk,signInMounted=false;
 const api=window.HisaabAuth={provider:'loading',isSignedIn:false};
 function lock(message){
  $('pin-lock-overlay').hidden=false;
  document.querySelectorAll('body > :not(#pin-lock-overlay)').forEach(el=>el.inert=true);
  $('clerk-login-message').textContent=message;
 }
 function script(url,attributes={}){
  return new Promise((resolve,reject)=>{
   const el=document.createElement('script');el.src=url;el.crossOrigin='anonymous';el.async=true;
   for(const [key,value]of Object.entries(attributes))el.setAttribute(key,value);
   el.onload=resolve;el.onerror=()=>reject(Error('Clerk could not load. Check your connection and retry.'));document.head.append(el);
  });
 }
 api.loading=()=>{
  lock('آپ کا اکاؤنٹ کھل رہا ہے…');
  $('clerk-sign-in').hidden=true;
  $('clerk-signed-in').hidden=true;
  $('clerk-login-error').textContent='';
 };
 api.showError=message=>{
  lock('ایپ کھل نہیں سکی۔');
  $('clerk-login-error').textContent=message;
  $('clerk-retry').hidden=false;
  $('clerk-retry').onclick=()=>location.reload();
 };
 api.login=async(message='اپنے یوزر نیم اور پاس ورڈ سے لاگ ان کریں۔')=>{
  lock(message);$('pin-unlock-form').hidden=true;$('clerk-login-panel').hidden=false;
  if(!clerk)return false;
  if(!clerk.session){
   $('clerk-sign-in').hidden=false;
   if(!signInMounted){clerk.mountSignIn($('clerk-sign-in'),{routing:'hash',forceRedirectUrl:location.origin+'/',withSignUp:false,transferable:false,appearance:{elements:{footerAction:{display:'none'}}}});signInMounted=true;}
   return false;
  }
  $('clerk-signed-in').hidden=false;
  $('clerk-access-message').textContent='اس اکاؤنٹ کو برانچ رسائی نہیں ملی۔ اپنی برانچ کی رسائی کے لیے ایڈمن سے رابطہ کریں۔';
  return false;
 };
 api.getToken=async()=>clerk?.session?clerk.session.getToken():null;
 api.signOut=async()=>{await clerk?.signOut({redirectUrl:location.origin+'/'});};
 api.ready=(async()=>{
  const res=await window.fetch('/api/auth/config',{cache:'no-store'});if(!res.ok)throw Error('Login configuration could not load. Reload to retry.');
  config=await res.json();api.provider='clerk';
  if(config.provider!=='clerk')throw Error('Username login is not configured. Contact the app owner.');
  $('pin-unlock-form').hidden=true;$('clerk-login-panel').hidden=false;
  if(!config.ready)throw Error('Clerk setup is incomplete. Ask the app owner to complete development configuration.');
  const host=atob(config.publishableKey.replace(/^pk_(test|live)_/,'')).replace(/\$$/,'');
  if(!/^[a-zA-Z0-9.-]+$/.test(host))throw Error('Invalid Clerk configuration');
  await script('https://'+host+'/npm/@clerk/ui@1/dist/ui.browser.js');
  await script('https://'+host+'/npm/@clerk/clerk-js@6/dist/clerk.browser.js',{'data-clerk-publishable-key':config.publishableKey});
  clerk=window.Clerk;await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});api.isSignedIn=!!clerk.session;
  if(api.isSignedIn)api.loading();
  if(api.isSignedIn){$('clerk-user-button').hidden=false;clerk.mountUserButton($('clerk-user-button'));}
  clerk.addListener(({session})=>{
   if(session&&!api.isSignedIn){api.isSignedIn=true;api.loading();location.reload();return;}
   if(!session&&api.isSignedIn){api.isSignedIn=false;api.login('سیشن ختم ہو گیا۔ دوبارہ لاگ ان کریں۔');}
  });
  $('clerk-sign-out').onclick=()=>api.signOut();
  if(!api.isSignedIn)await api.login();
 })();
 api.ready.catch(error=>{lock('لاگ ان تیار نہیں ہو سکا۔');$('clerk-login-error').textContent=error.message;$('clerk-login-panel').hidden=false;$('pin-unlock-form').hidden=true;});
})();
