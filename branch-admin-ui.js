(()=>{
 'use strict';
 const el=(tag,text,attributes={})=>Object.assign(document.createElement(tag),{textContent:text,...attributes});
 let dialog,request,office,revision,offset=0,total=0;
 const message=el('p','',{role:'status',className:'ba-message'}),list=el('div','',{className:'branch-admin-users'}),names=el('div','',{className:'ba-branches'});
 const branchCount=el('strong','—'),userCount=el('strong','—');
 function notice(text,tone=''){message.textContent=text;message.dataset.tone=tone;}
 function field(label,input,hint){const wrap=el('label','',{className:'ba-field'});wrap.append(el('span',label),input);if(hint)wrap.append(el('small',hint));return wrap;}
 const branchSelect=()=>el('select','');
 const newBranch=branchSelect();
 async function call(url,body){
  const response=await request(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Hisaab-Branch':office},...(body?{body:JSON.stringify({...body,revision})}:{})});
  const data=await response.json();if(!response.ok)throw Error(data.message||'Request failed.');return data;
 }
 async function run(action,button){
  if(button)button.disabled=true;notice('Saving…','busy');
  try{await action();await load();notice('Saved.','success');}catch(error){notice(error.message,'error');}
  finally{if(button)button.disabled=false;}
 }
 async function load(){
  const data=await call('/api/admin/access?offset='+offset);revision=data.revision;total=data.total;
  names.replaceChildren(...data.branches.map(b=>{const chip=el('div','',{className:'ba-branch-card'});chip.append(el('span','▦',{className:'ba-branch-icon',ariaHidden:'true'}),el('strong',b.name));return chip;}));
  branchCount.textContent=data.branches.length;userCount.textContent=total;
  const options=select=>{select.replaceChildren(...data.branches.map(b=>new Option(b.name,b.id)));};
  const selected=newBranch.value;options(newBranch);if(data.branches.some(b=>b.id===selected))newBranch.value=selected;list.replaceChildren();
  for(const user of data.users){
   const row=el('div','',{className:'branch-admin-user'});
   const identity=el('div','',{className:'ba-identity'}),identityText=el('div','');
   identityText.append(el('strong',user.username),el('small',user.id));
   identity.append(el('span',user.username.slice(0,2).toUpperCase(),{className:'ba-avatar',ariaHidden:'true'}),identityText);
   const state=user.owner?'Owner':user.assignment?.enabled?'Enabled':user.assignment?'Disabled':'Unassigned';
   const badge=el('span',state,{className:'ba-badge '+state.toLowerCase()});
   row.append(identity,badge);
   if(user.owner){row.classList.add('ba-owner');row.append(el('p','Full access to all branches',{className:'ba-owner-note'}));list.append(row);continue;}
   const select=branchSelect();options(select);select.value=user.assignment?.branch||data.branches[0].id;
   select.setAttribute('aria-label','Branch for '+user.username);
   const enabled=el('input','',{type:'checkbox',checked:user.assignment?.enabled===true});
   const label=el('label','',{className:'ba-access'});enabled.setAttribute('aria-label','Access enabled for '+user.username);label.append(enabled,el('span','Access enabled'));
   const save=el('button','Save assignment',{type:'button',className:'ba-save'});
   save.onclick=()=>run(()=>call('/api/admin/users/'+encodeURIComponent(user.id)+'/assignment',{branch:select.value,enabled:enabled.checked}),save);
   const controls=el('div','',{className:'ba-user-controls'});controls.append(field('Assigned branch',select),label,save);row.append(controls);
   if(!user.assignment)row.append(el('small','Select a branch and enable access to activate this account.',{className:'ba-assignment-hint'}));
   list.append(row);
  }
  if(!data.users.length)list.append(el('p','No users found. Create your first branch user above.',{className:'ba-empty'}));
  previous.disabled=offset===0;next.disabled=offset+50>=total;
  page.textContent=`${Math.min(offset+1,total)}–${Math.min(offset+50,total)} of ${total}`;
 }
 const previous=el('button','Previous',{type:'button'}),next=el('button','Next',{type:'button'}),page=el('span','');
 previous.onclick=()=>{offset=Math.max(0,offset-50);load().catch(e=>message.textContent=e.message);};
 next.onclick=()=>{offset+=50;load().catch(e=>message.textContent=e.message);};
 function build(){
  dialog=el('dialog','',{className:'branch-admin-dialog'});dialog.dir='ltr';dialog.setAttribute('aria-label','Branches and users');
  const close=el('button','Close',{type:'button',className:'ba-close'});close.onclick=()=>dialog.close();
  const header=el('div','',{className:'ba-header'}),heading=el('div','');heading.append(el('span','ADMIN WORKSPACE',{className:'ba-eyebrow'}),el('h2','Branches & users'),el('p','Organize your branches and manage who can access them.'));header.append(heading,close);
  const branchForm=el('form','',{className:'branch-admin-form'}),branchName=el('input','',{required:true,minLength:2,maxLength:80,placeholder:'New branch name'}),branchButton=el('button','Add branch',{type:'submit'});
  branchName.setAttribute('aria-label','New branch name');branchButton.className='ba-add';branchForm.append(field('Branch name',branchName,'Use a clear name, such as Satwa Branch.'),branchButton);
  branchForm.onsubmit=e=>{e.preventDefault();run(async()=>{const data=await call('/api/admin/branches',{name:branchName.value});branchName.value='';document.getElementById('office-select').add(new Option(data.branch.name,data.branch.id));},branchButton);};
  const userForm=el('form','',{className:'branch-admin-form'}),username=el('input','',{required:true,minLength:4,maxLength:64,placeholder:'Username / login ID',autocomplete:'off'}),password=el('input','',{required:true,type:'password',minLength:8,maxLength:128,placeholder:'Password (8+ characters)',autocomplete:'new-password'}),create=el('button','Create user',{type:'submit'});
  username.setAttribute('aria-label','Username');password.setAttribute('aria-label','New user password');newBranch.setAttribute('aria-label','New user branch');
  create.className='ba-create';
  userForm.append(field('Login ID',username,'4–64 letters, numbers or underscores.'),field('Password',password,'Minimum 8 characters.'),field('Branch',newBranch),create);
  userForm.onsubmit=e=>{e.preventDefault();const value=password.value;password.value='';run(async()=>{await call('/api/admin/users',{username:username.value,password:value,branch:newBranch.value});username.value='';},create);};
  const refresh=el('button','Refresh',{type:'button',className:'ba-refresh'});refresh.onclick=()=>load().catch(e=>notice(e.message,'error'));
  const navigation=el('div','',{className:'ba-navigation'});navigation.append(previous,page,next);
  const stats=el('div','',{className:'ba-stats'});for(const [count,label]of [[branchCount,'Branches'],[userCount,'User accounts']]){const stat=el('div','');stat.append(count,el('span',label));stats.append(stat);}
  const branchSection=el('section','',{className:'ba-branch-section'});branchSection.append(el('h3','Your branches'),names);
  const branchCard=el('section','',{className:'ba-form-card'});branchCard.append(el('span','01 · BRANCH',{className:'ba-eyebrow'}),el('h3','Add a branch'),el('p','Give each office its own workspace.'),branchForm);
  const userCard=el('section','',{className:'ba-form-card'});userCard.append(el('span','02 · ACCOUNT',{className:'ba-eyebrow'}),el('h3','Create branch user'),el('p','A separate login ID for every staff member.'),userForm);
  const forms=el('div','',{className:'ba-forms'});forms.append(branchCard,userCard);
  const userHeading=el('div','',{className:'ba-section-heading'}),userTitle=el('div','');userTitle.append(el('h3','Users & assignments'),el('p','Each staff account has access to one assigned branch.'));userHeading.append(userTitle,refresh);
  const content=el('div','',{className:'ba-body'});content.append(stats,branchSection,forms,message,userHeading,list,navigation);
  dialog.append(header,content);
  document.body.append(dialog);
 }
 window.HisaabBranchAdmin={async open(fetcher,activeOffice){request=fetcher;office=activeOffice;if(!dialog)build();dialog.showModal();notice('Loading…','busy');try{await load();notice('');}catch(error){notice(error.message,'error');}}};
})();
