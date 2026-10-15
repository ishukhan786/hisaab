(() => {
  'use strict';
  const KEY = 'hisaab-register-v1';
  const $ = id => document.getElementById(id);
  const rowFields = ['entryDate','sender','mobile','receiver','place','branch','balance','aed','pkr'];
  const fields = ['sender','mobile','receiver','place','branch','balance','aed','pkr'];
  const labels = ['ارسال کنندہ','موبائیل نمبر','وصول کنندہ','مقام','پارٹی','بقایا','درہم','روپیہ'];
  const moneyFields = ['balance','aed','pkr'];
  const populated = r => ['sender','mobile','receiver','place',...moneyFields].some(f => r[f].trim());
  const cleanName = value => value.trim().replace(/\s+/g,' ');
  const nameKey = value => cleanName(value).toLocaleLowerCase();
  const uid = () => crypto.randomUUID();
  function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function dateValid(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(`${s}T12:00:00Z`);return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
  function englishDigits(v){return v.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/٫/g,'.').replace(/٬/g,',');}
  function normalized(v){return englishDigits(v).replace(/[,\s]/g,'');}
  function integerAmount(v){const n=normalized(v);if(!n)return 0n;if(!/^-?\d{1,12}(\.0{1,2})?$/.test(n))return null;return BigInt(n.split('.')[0]);}
  function wholeText(v){const n=integerAmount(v);return v.trim()&&n!==null?formatted(n):v;}
  function formatted(n){return n.toLocaleString('en-US');}
  function blank(branch=''){return {...Object.fromEntries(rowFields.map(f=>[f,''])),id:uid(),entryDate:state.date||today(),branch};}
  function fmtDate(iso){if(!iso)return '';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;}
  let state={version:4,title:'اندراج رجسٹر',date:today(),startSerial:1,fontSize:13,branches:[],partyCurrencies:{},rows:[],trash:[],lastBackupAt:null};
  const partyCurrency=name=>(name&&state.partyCurrencies?.[name])||'pkr';
  const activeCurrency=()=>selectedBranch.startsWith('b:')?partyCurrency(selectedBranch.slice(2)):'pkr';
  let storageBlocked=false, selectedBranch='', pendingBranchRow=null;
  const rowNodes=new Map();
  function migrate(source){
    if(!source || ![1,2,3,4].includes(source.version) || typeof source.title!=='string' || source.title.length>100 || typeof source.date!=='string' || (source.date && !dateValid(source.date)) || !Array.isArray(source.rows) || source.rows.length>10000)throw Error('Invalid backup');
    const registry=[];
    function register(name){if(typeof name!=='string'||name.length>300)throw Error('Invalid party');const cleaned=cleanName(name);if(!cleaned)return '';const existing=registry.find(n=>nameKey(n)===nameKey(cleaned));if(existing)return existing;registry.push(cleaned);return cleaned;}
    if(source.branches!==undefined && (!Array.isArray(source.branches)||source.branches.length>10000))throw Error('Invalid parties');
    (source.branches||[]).forEach(register);
    const ids=new Set();
    function convert(row){
      if(!row||typeof row!=='object')throw Error('Invalid row');
      const result={};
      rowFields.forEach(f=>{const v=row[f]===undefined&&['entryDate','branch'].includes(f)?'':row[f];if(typeof v!=='string'||v.length>300)throw Error('Invalid field');result[f]=v;});
      if(result.entryDate&&!dateValid(result.entryDate))throw Error('Invalid date');
      if(!result.entryDate)result.entryDate=source.date||today();
      result.branch=register(result.branch);
      for(const f of [...moneyFields,'mobile'])result[f]=moneyFields.includes(f)?wholeText(englishDigits(result[f])):englishDigits(result[f]);
      result.id=typeof row.id==='string'&&row.id.length<100&&!ids.has(row.id)?row.id:uid();ids.add(result.id);return result;
    }
    const rows=source.rows.map(convert);
    if(source.version===3)rows.reverse();
    if(source.trash!==undefined&&(!Array.isArray(source.trash)||source.trash.length>20))throw Error('Invalid undo');
    const trash=(source.trash||[]).map(item=>{if(!item||!Number.isInteger(item.index)||item.index<0)throw Error('Invalid undo');return {row:convert(item.row),index:item.index};});
    const startSerial=Number.isInteger(source.startSerial)&&source.startSerial>0?source.startSerial:1;
    const partyCurrencies=(source.partyCurrencies&&typeof source.partyCurrencies==='object'&&!Array.isArray(source.partyCurrencies))?source.partyCurrencies:{};
    return {version:4,title:source.title,date:source.date||today(),startSerial,fontSize:Number.isInteger(source.fontSize)?Math.max(10,Math.min(22,source.fontSize)):13,branches:registry,partyCurrencies,rows,trash,lastBackupAt:typeof source.lastBackupAt==='string'&&Number.isFinite(Date.parse(source.lastBackupAt))?source.lastBackupAt:null};
  }
  try{const raw=localStorage.getItem(KEY);if(raw)state=migrate(JSON.parse(raw));}catch{storageBlocked=true;alert('محفوظ ڈیٹا نہیں کھل سکا۔ اصل ڈیٹا محفوظ رکھا گیا ہے؛ درست بیک اَپ کھولیں۔');}
  function persist(){if(storageBlocked){$('save-state').textContent='محفوظ نہیں ہو رہا — بیک اَپ بحال کریں';return false;}try{const clean={...state,rows:state.rows.filter(populated)};localStorage.setItem(KEY,JSON.stringify(clean));$('save-state').textContent='✓ محفوظ ہے';return true;}catch{$('save-state').textContent='محفوظ نہیں ہو سکا — بیک اَپ لیں';return false;}}
  function save(){const ok=persist();if(ok)scheduleAutoBackup();return ok;}
  const branchMatch=r=>!selectedBranch||(selectedBranch==='__unassigned'?!r.branch:r.branch===selectedBranch.slice(2));
  function rangeValid(){return !$('date-from').value||!$('date-to').value||$('date-from').value<=$('date-to').value;}
  // View modes: a date range wins; otherwise "all dates" or just the working date (day view).
  const rangeActive=()=>!!($('date-from').value||$('date-to').value);
  const dayMode=()=>!rangeActive()&&!$('all-dates').checked;
  function dateMatch(r){
    if(rangeActive()){const from=$('date-from').value,to=$('date-to').value;if(!r.entryDate)return false;return !(from&&r.entryDate<from||to&&r.entryDate>to);}
    return $('all-dates').checked||r.entryDate===state.date;
  }
  function queryMatch(r){
    const query=englishDigits($('search').value).trim().toLocaleLowerCase();
    if(!query)return true;
    const text=[r.sender,r.receiver,r.mobile,r.place,r.branch].join(' ').toLocaleLowerCase();
    const phoneQuery=query.replace(/[\s()+-]/g,'');
    return text.includes(query)||(/^\d+$/.test(phoneQuery)&&r.mobile.replace(/[\s()+-]/g,'').includes(phoneQuery));
  }
  function matches(r){return populated(r)&&branchMatch(r)&&rangeValid()&&dateMatch(r)&&queryMatch(r);}
  const selectedRows=()=>state.rows.filter(matches);
  function makeOption(value,label){const option=document.createElement('option');option.value=value;option.textContent=label;return option;}
  function branchOptions(select,value,filter=false){select.replaceChildren(...(filter?[makeOption('','تمام پارٹیاں'),makeOption('__unassigned','بغیر پارٹی')]:[makeOption('','بغیر پارٹی')]),...state.branches.slice().sort((a,b)=>a.localeCompare(b,'ur')).map(n=>makeOption(filter?'b:'+n:n,n)));if(!filter)select.append(makeOption('__new_party__','＋ نئی پارٹی'));select.value=value;}
  function renderPartyTabs(){
    const container=$('party-tabs');
    if(!container)return;
    container.replaceChildren();
    const allTab=document.createElement('button');allTab.type='button';allTab.className='party-tab'+(selectedBranch===''?' active':'');allTab.role='tab';allTab.setAttribute('aria-selected',selectedBranch===''?'true':'false');
    const allCount=state.rows.filter(populated).length;
    allTab.innerHTML=`<span>📁 تمام پارٹیاں</span><span class="tab-badge">${allCount}</span>`;
    allTab.onclick=()=>selectPartyTab('');
    container.append(allTab);
    const sorted=state.branches.slice().sort((a,b)=>a.localeCompare(b,'ur'));
    for(const name of sorted){
      const tab=document.createElement('button');tab.type='button';const isSel=selectedBranch==='b:'+name;tab.className='party-tab'+(isSel?' active':'');tab.role='tab';tab.setAttribute('aria-selected',isSel?'true':'false');
      const count=state.rows.filter(r=>r.branch===name&&populated(r)).length;
      const isAfn=partyCurrency(name)==='afn';
      const currTag=isAfn?'<span class="tab-curr-tag">افغانی</span>':'';
      tab.innerHTML=`<span>🏢 ${name}</span>${currTag}<span class="tab-badge">${count}</span>`;
      tab.onclick=()=>selectPartyTab('b:'+name);
      container.append(tab);
    }
    const unassignedCount=state.rows.filter(r=>!r.branch&&populated(r)).length;
    if(unassignedCount>0){
      const unassignedTab=document.createElement('button');unassignedTab.type='button';const isSel=selectedBranch==='__unassigned';unassignedTab.className='party-tab'+(isSel?' active':'');unassignedTab.role='tab';unassignedTab.setAttribute('aria-selected',isSel?'true':'false');
      unassignedTab.innerHTML=`<span>بغیر پارٹی</span><span class="tab-badge">${unassignedCount}</span>`;
      unassignedTab.onclick=()=>selectPartyTab('__unassigned');
      container.append(unassignedTab);
    }
  }
  function selectPartyTab(value){
    selectedBranch=value;
    if($('branch-filter'))$('branch-filter').value=value;
    applyFilter();
    updatePartyTabsActive();
    if(value.startsWith('b:')){
      const draft=state.rows.find(r=>branchMatch(r)&&!populated(r));
      if(draft)setTimeout(()=>focusRow(draft),50);
    }
  }
  function updatePartyTabsActive(){
    const container=$('party-tabs');
    if(!container)return;
    const sorted=state.branches.slice().sort((a,b)=>a.localeCompare(b,'ur'));
    Array.from(container.children).forEach((tab,i)=>{
      let tabVal=i===0?'':i-1<sorted.length?'b:'+sorted[i-1]:'__unassigned';
      const isSel=selectedBranch===tabVal;
      tab.classList.toggle('active',isSel);
      tab.setAttribute('aria-selected',isSel?'true':'false');
    });
  }
  function updateBranches(){branchOptions($('branch-filter'),selectedBranch,true);state.rows.forEach(row=>{const select=rowNodes.get(row.id)?.querySelector('[data-field="branch"]');if(select)branchOptions(select,row.branch);});renderPartyTabs();}
  function ensureDraft(){
    // Keep unpopulated draft row at the bottom (after populated rows)
    state.rows=[...state.rows.filter(populated),...state.rows.filter(r=>!populated(r))];
    for(const r of state.rows.filter(r=>!populated(r))){
      const node=rowNodes.get(r.id);
      if(node && node!==$('rows').lastElementChild && !node.contains(document.activeElement)){
        $('rows').append(node);
      }
    }
    if(state.rows.some(r=>branchMatch(r)&&!populated(r)))return;
    const activeTr=document.activeElement?.closest('#rows tr');
    if(activeTr)return;
    const row=blank(selectedBranch.startsWith('b:')?selectedBranch.slice(2):'');
    state.rows.push(row);
    appendRow(row);
    save();
  }
  function totals(){const rows=selectedRows();for(const field of moneyFields){let total=0n,invalid=false;for(const row of rows){const value=integerAmount(row[field]);if(value===null)invalid=true;else total+=value;}$('total-'+field).textContent=invalid?'رقم درست کریں':formatted(total);}$('count').textContent=`${rows.length} اندراجات`;
    const fractional=rows.some(r=>moneyFields.some(f=>integerAmount(r[f])===null));
    $('filter-message').textContent=!rangeValid()?'تاریخ سے، تاریخ تک سے آگے نہیں ہو سکتی۔':dayMode()?`${fmtDate(state.date)} کی ${rows.length} انٹریاں۔ پرنٹ اور مجموعہ انہی کا ہے۔`:`${rows.length} انٹریاں منتخب ہیں۔ پرنٹ اور مجموعہ انہی کا ہے۔ نئی انٹری کے لیے "＋ نئی قطار" دبائیں۔`;
    if(fractional)$('filter-message').textContent+=' رقم میں صرف مکمل عدد لکھیں؛ پرانی اعشاری رقم کو خود نہیں بدلا گیا۔';
    $('filter-message').classList.toggle('error',!rangeValid()||fractional);
  }
  function viewLabel(){
    if(rangeActive())return [$('date-from').value?fmtDate($('date-from').value):'شروع',$('date-to').value?fmtDate($('date-to').value):'آج تک'].join(' — ');
    return $('all-dates').checked?'تمام تاریخیں':fmtDate(state.date);
  }
  function applyFilter(keepFocus=false){ensureDraft();const start=(Number(state.startSerial)||1);let offset=0;const active=keepFocus?document.activeElement?.closest('#rows tr'):null;let draftShown=false;const day=dayMode();
    state.rows.forEach(r=>{const tr=rowNodes.get(r.id);let draft=day&&branchMatch(r)&&!populated(r)&&!draftShown;if(draft)draftShown=true;const matched=matches(r);tr.hidden=!(matched||draft||tr===active);tr.classList.toggle('draft-row',!populated(r));
      const cell=tr.firstElementChild;const val=matched?(start+offset++):!populated(r)?'＋':'—';cell.textContent=String(val);cell.title=matched?`سیریل: ${val} (تبدیل کرنے کے لیے کلک کریں)`:(r.entryDate?fmtDate(r.entryDate):'');
      if(matched&&!day){const small=document.createElement('small');small.className='row-date';small.textContent=fmtDate(r.entryDate);cell.append(small);}});
    const isParty=selectedBranch.startsWith('b:');
    const paper=document.querySelector('.paper');
    if(paper)paper.classList.toggle('party-page',isParty);
    const branch=selectedBranch===''?'تمام پارٹیاں':selectedBranch==='__unassigned'?'بغیر پارٹی':selectedBranch.slice(2);
    $('branch-heading').textContent=(isParty?'🏢 ':'')+branch+($('search').value.trim()?' | تلاش: '+$('search').value.trim():'');
    $('view-note').textContent=day?'':'دکھایا جا رہا ہے: '+viewLabel();
    if($('date-screen-badge'))$('date-screen-badge').textContent=fmtDate(state.date||today());
    const hasRange=rangeActive();
    if($('toggle-range'))$('toggle-range').classList.toggle('active',hasRange||!($('range-drawer')?.hidden??true));
    totals();
    const curr=activeCurrency();
    const isAfn=curr==='afn';
    const hasAnyAfn=Object.values(state.partyCurrencies||{}).some(c=>c==='afn');
    const currLabel=isAfn?'افغانی':(selectedBranch===''&&hasAnyAfn?'روپیہ / افغانی':'روپیہ');
    if($('th-currency'))$('th-currency').textContent=currLabel;
    if($('total-pkr'))$('total-pkr').title=isAfn?'کل افغانی':'کل روپیہ';
    updatePartyTabsActive();
  }
  function updateBackup(){const at=state.lastBackupAt;const overdue=!at||Date.now()-Date.parse(at)>7*86400000;$('backup-banner').classList.toggle('backup-due',overdue);$('backup-status').textContent=at?`آخری بیک اَپ ڈاؤن لوڈ: ${new Date(at).toLocaleString('en-GB')}${overdue?' — نیا بیک اَپ لے لیں۔':''}`:'ابھی بیک اَپ نہیں لیا گیا۔ اپنی انٹریوں کا بیک اَپ محفوظ کریں۔';}
  function updateUndo(){$('undo-bar').hidden=!state.trash.length;$('undo-message').textContent=`${state.trash.length} حذف شدہ انٹریاں واپس لائی جا سکتی ہیں۔ آخری حذف پہلے واپس ہوگا۔`;}
  function createRowElement(row){
    const tr=document.createElement('tr');tr.dataset.id=row.id;rowNodes.set(row.id,tr);
    const num=document.createElement('td');num.className='number';
    num.onclick=()=>{
      if(!populated(row))return;
      const current=parseInt(englishDigits(num.textContent),10)||(state.startSerial||1);
      const next=prompt('اس قطار کا نیا سیریل نمبر لکھیں (یہیں سے آگے خودکار نمبر بنیں گے):',current);
      if(next===null)return;
      const val=parseInt(englishDigits(next.trim()),10);
      if(!isNaN(val)&&val>0){
        const visible=state.rows.filter(matches);
        const idx=visible.indexOf(row);
        const newStart=Math.max(1,val-(idx>=0?idx:0));
        state.startSerial=newStart;
        if($('start-serial'))$('start-serial').value=newStart;
        save();applyFilter(true);
      }
    };
    tr.append(num);
    fields.forEach((field,i)=>{
      const td=document.createElement('td');if(field==='branch')td.className='col-branch no-print';if(field==='place')td.className='col-place';
      const isText=['sender','receiver','place'].includes(field);
      const input=document.createElement(field==='branch'?'select':(isText?'textarea':'input'));input.dataset.field=field;input.setAttribute('aria-label',labels[i]);input.autocomplete='off';input.maxLength=moneyFields.includes(field)?20:300;
      if(isText){input.rows=1;input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();input.blur();}});}
      if(field==='branch')branchOptions(input,row.branch);else input.value=moneyFields.includes(field)?wholeText(row[field]):row[field];
      function adjustHeight(el){if(typeof CSS!=='undefined'&&CSS.supports&&CSS.supports('field-sizing','content'))return;el.style.height='auto';el.style.height=el.scrollHeight+'px';}
      if(isText)adjustHeight(input);
      if(moneyFields.includes(field)){input.className='amount';input.inputMode='numeric';input.placeholder='0';if(field==='pkr')input.setAttribute('aria-label',partyCurrency(row.branch)==='afn'?'افغانی':'روپیہ');input.setCustomValidity(integerAmount(row[field])===null?'رقم درست کریں':'');}
      if(field==='mobile'){input.className='phone';input.inputMode='tel';}
      if(field==='place'){input.className='place-input';}
      function accept(event){
        if(event?.isComposing)return;
        if(field==='branch'&&input.value==='__new_party__'){input.value=row.branch;openBranches(row);return;}
        if(moneyFields.includes(field)||field==='mobile'){const value=englishDigits(input.value);if(value!==input.value){const start=input.selectionStart,end=input.selectionEnd;input.value=value;if(start!==null)input.setSelectionRange(start,end);}}
        row[field]=input.value;
        if(isText)adjustHeight(input);
        if(!row.entryDate)row.entryDate=state.date||today();
        if(selectedBranch.startsWith('b:')&&!row.branch)row.branch=selectedBranch.slice(2);
        if(moneyFields.includes(field))input.setCustomValidity(integerAmount(input.value)===null?'صرف مکمل عدد لکھیں، اعشاری رقم نہیں':'');
        applyFilter(true);save();
      }
      if(moneyFields.includes(field)){
        input.addEventListener('blur',()=>{const value=wholeText(input.value);if(value!==input.value){input.value=value;row[field]=value;save();}});
        input.addEventListener('keydown',e=>{if(e.key==='Enter')input.blur();});
      }
      input.addEventListener(field==='branch'?'change':'input',accept);input.addEventListener('compositionend',()=>accept());
      input.addEventListener('keydown',e=>{
        if(e.key==='Tab'&&!e.shiftKey&&i===fields.length-1){
          e.preventDefault();
          const visible=state.rows.filter(r=>!rowNodes.get(r.id).hidden);
          const next=visible[visible.indexOf(row)+1];
          if(!next){add();}else{focusRow(next);}
        }
      });
      td.append(input);tr.append(td);
    });
    tr.addEventListener('focusout',()=>setTimeout(()=>{if(!tr.contains(document.activeElement))applyFilter(true);},0));
    const td=document.createElement('td');td.className='no-print';const del=document.createElement('button');del.className='delete';del.textContent='×';del.title='حذف کریں — Undo سے واپس لائیں';del.setAttribute('aria-label','انٹری حذف کریں');
    del.onclick=()=>{const index=state.rows.findIndex(r=>r.id===row.id);if(index<0)return;if(populated(row)){state.trash.push({row:structuredClone(row),index});state.trash=state.trash.slice(-20);}state.rows.splice(index,1);render();save();};td.append(del);tr.append(td);
    return tr;
  }
  function appendRow(row){$('rows').append(createRowElement(row));}
  function prependRow(row){$('rows').prepend(createRowElement(row));}
  function applyFont(){document.documentElement.style.setProperty('--entry-font',state.fontSize+'px');$('font-size').textContent=state.fontSize;$('font-smaller').disabled=state.fontSize<=10;$('font-larger').disabled=state.fontSize>=22;}
  function render(){rowNodes.clear();$('rows').replaceChildren();$('title').value=state.title;$('date').value=state.date;if($('start-serial'))$('start-serial').value=state.startSerial||1;applyFont();state.rows.forEach(appendRow);updateBranches();applyFilter();updateUndo();updateBackup();}
  function focusRow(row){rowNodes.get(row.id)?.querySelector('[data-field="sender"]').focus();}
  function add(){
    let row=state.rows.find(r=>branchMatch(r)&&!populated(r));
    if(!row){
      row=blank(selectedBranch.startsWith('b:')?selectedBranch.slice(2):'');
      state.rows.push(row);
      appendRow(row);
      save();
    } else if(state.rows[state.rows.length-1]!==row){
      state.rows=state.rows.filter(r=>r!==row);
      state.rows.push(row);
      const node=rowNodes.get(row.id);
      if(node) $('rows').append(node);
      save();
    }
    applyFilter();
    focusRow(row);
  }
  $('add').onclick=add;
  $('undo').onclick=()=>{const item=state.trash.pop();if(!item)return;if(item.row.branch&&!state.branches.includes(item.row.branch))state.branches.push(item.row.branch);state.rows.splice(Math.min(item.index,state.rows.length),0,item.row);render();save();if(rowNodes.get(item.row.id).hidden)$('filter-message').textContent='انٹری واپس آ گئی ہے۔ اسے دیکھنے کے لیے فلٹر صاف کریں۔';};
  let autoBackupHandle=null, autoBackupTimer=null;
  function scheduleAutoBackup(immediate=false){
    if(!autoBackupHandle)return;
    clearTimeout(autoBackupTimer);
    autoBackupTimer=setTimeout(async()=>{
      try{
        const writable=await autoBackupHandle.createWritable();
        const clean={...state,rows:state.rows.filter(populated)};
        await writable.write(JSON.stringify(clean,null,2));
        await writable.close();
        const time=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
        $('auto-backup-status').textContent=`خودکار محفوظ: ${time} ✓`;
      }catch(err){
        $('auto-backup-status').textContent='خودکار محفوظ نہ ہو سکا';
      }
    },immediate?0:1500);
  }
  async function setupAutoBackup(){
    if(!window.showSaveFilePicker)return;
    try{
      const handle=await window.showSaveFilePicker({
        suggestedName:`hisaab-auto-backup.json`,
        types:[{description:'JSON Backup',accept:{'application/json':['.json']}}]
      });
      autoBackupHandle=handle;
      $('auto-backup-status').textContent='خودکار فائل: فعال ✓';
      scheduleAutoBackup(true);
    }catch(e){/* cancelled by user */}
  }
  if(window.showSaveFilePicker){
    $('auto-backup').hidden=false;
    $('auto-backup').onclick=setupAutoBackup;
  }
  if($('start-serial')){
    $('start-serial').addEventListener('input',()=>{
      const clean=englishDigits($('start-serial').value);
      if(clean!==$('start-serial').value)$('start-serial').value=clean;
      const val=parseInt(clean,10);
      state.startSerial=(!isNaN(val)&&val>0)?val:1;
      save();applyFilter(true);
    });
    $('start-serial').addEventListener('blur',()=>{
      $('start-serial').value=state.startSerial||1;
    });
  }
  $('branch-filter').onchange=()=>{selectedBranch=$('branch-filter').value;applyFilter();updatePartyTabsActive();};
  $('all-dates').onchange=()=>applyFilter();
  for(const id of ['search','date-from','date-to'])$(id).addEventListener('input',()=>applyFilter());
  if($('toggle-range'))$('toggle-range').onclick=()=>{const d=$('range-drawer');if(!d)return;d.hidden=!d.hidden;$('toggle-range').classList.toggle('active',!d.hidden||rangeActive());if(!d.hidden)$('date-from').focus();};
  if($('clear-range-btn'))$('clear-range-btn').onclick=()=>{for(const id of ['date-from','date-to'])$(id).value='';if($('range-drawer'))$('range-drawer').hidden=true;if($('toggle-range'))$('toggle-range').classList.remove('active');applyFilter();};
  function resetFilters(){selectedBranch='';$('branch-filter').value='';$('all-dates').checked=false;for(const id of ['search','date-from','date-to'])$(id).value='';if($('range-drawer'))$('range-drawer').hidden=true;if($('toggle-range'))$('toggle-range').classList.remove('active');applyFilter();updatePartyTabsActive();}
  $('reset-filters').onclick=resetFilters;
  $('font-smaller').onclick=()=>{state.fontSize=Math.max(10,state.fontSize-1);applyFont();save();};$('font-larger').onclick=()=>{state.fontSize=Math.min(22,state.fontSize+1);applyFont();save();};
  $('title').addEventListener('input',()=>{state.title=$('title').value;save();});
  $('date').addEventListener('input',()=>{
    state.date=$('date').value;
    save();
    applyFilter();
  });
  function openSummary(){
    const rows=state.rows.filter(populated);
    const groups=new Map();
    for(const r of rows){
      const d=r.entryDate||state.date||today();
      if(!groups.has(d))groups.set(d,{count:0,balance:0n,aed:0n,pkr:0n});
      const g=groups.get(d);
      g.count++;
      for(const f of moneyFields){
        const v=integerAmount(r[f]);
        if(v!==null)g[f]+=v;
      }
    }
    const dates=[...groups.keys()].sort((a,b)=>b.localeCompare(a));
    const tbody=$('summary-rows');
    tbody.replaceChildren();
    if(!dates.length){
      const tr=document.createElement('tr');
      const td=document.createElement('td');
      td.colSpan=5;td.style.textAlign='center';td.textContent='ابھی کوئی انٹری موجود نہیں ہے۔';
      tr.append(td);tbody.append(tr);
    }
    let totCount=0,totBal=0n,totAed=0n,totPkr=0n;
    for(const d of dates){
      const g=groups.get(d);
      totCount+=g.count;totBal+=g.balance;totAed+=g.aed;totPkr+=g.pkr;
      const tr=document.createElement('tr');
      tr.title=`${fmtDate(d)} کا رجسٹر کھولیں`;
      tr.onclick=()=>{
        state.date=d;
        $('date').value=d;
        $('all-dates').checked=false;
        $('date-from').value='';
        $('date-to').value='';
        if($('range-drawer'))$('range-drawer').hidden=true;
        if($('toggle-range'))$('toggle-range').classList.remove('active');
        save();
        applyFilter();
        $('summary-dialog').close();
      };
      const tdDate=document.createElement('td');tdDate.textContent=fmtDate(d);
      const tdCount=document.createElement('td');tdCount.textContent=g.count;
      const tdBal=document.createElement('td');tdBal.textContent=formatted(g.balance);
      const tdAed=document.createElement('td');tdAed.textContent=formatted(g.aed);
      const tdPkr=document.createElement('td');tdPkr.textContent=formatted(g.pkr);
      tr.append(tdDate,tdCount,tdBal,tdAed,tdPkr);
      tbody.append(tr);
    }
    $('summary-scope').textContent=`کل ${dates.length} دن، ${totCount} اندراجات۔`;
    $('summary-count').textContent=String(totCount);
    $('summary-balance').textContent=formatted(totBal);
    $('summary-aed').textContent=formatted(totAed);
    $('summary-pkr').textContent=formatted(totPkr);
    $('summary-dialog').showModal();
  }
  $('summary-open').onclick=openSummary;
  $('close-summary').onclick=()=>$('summary-dialog').close();
  function openBranches(row=null){pendingBranchRow=row;$('branch-error').textContent='';$('branch-name').value='';renderBranchList();$('branch-dialog').showModal();$('branch-name').focus();}
  $('manage-branches').onclick=()=>openBranches();$('close-branches').onclick=()=>$('branch-dialog').close();
  if($('add-party-tab'))$('add-party-tab').onclick=()=>openBranches();
  if($('manage-parties-tab'))$('manage-parties-tab').onclick=()=>openBranches();
  $('branch-dialog').addEventListener('close',()=>{pendingBranchRow=null;});
  function renderBranchList(){
    $('branch-list').replaceChildren();
    if(!state.branches.length){const p=document.createElement('p');p.textContent='ابھی کوئی پارٹی نہیں بنی۔';$('branch-list').append(p);}
    for(const name of state.branches){const div=document.createElement('div');div.className='party-item';const input=document.createElement('input');input.value=name;input.maxLength=300;input.setAttribute('aria-label','پارٹی کا نام تبدیل کریں');const count=document.createElement('small');count.textContent=state.rows.filter(r=>r.branch===name&&populated(r)).length+' اندراجات';
      const currSelect=document.createElement('select');currSelect.className='party-currency-select';currSelect.append(makeOption('pkr','روپیہ (PKR)'),makeOption('afn','افغانی (AFN)'));currSelect.value=partyCurrency(name);
      currSelect.onchange=()=>{if(!state.partyCurrencies)state.partyCurrencies={};state.partyCurrencies[name]=currSelect.value;save();updateBranches();applyFilter();$('branch-error').textContent=name+' کی کرنسی اب '+(currSelect.value==='afn'?'افغانی':'روپیہ')+' ہے۔';};
      const rename=document.createElement('button');rename.textContent='نام محفوظ کریں';rename.onclick=()=>{const next=cleanName(input.value);if(!next){$('branch-error').textContent='پارٹی کا نام لکھیں۔';return;}if(state.branches.some(n=>n!==name&&nameKey(n)===nameKey(next))){$('branch-error').textContent='یہ نام پہلے سے موجود ہے۔';return;}state.branches[state.branches.indexOf(name)]=next;if(state.partyCurrencies&&state.partyCurrencies[name]){state.partyCurrencies[next]=state.partyCurrencies[name];delete state.partyCurrencies[name];}for(const row of [...state.rows,...state.trash.map(t=>t.row)])if(row.branch===name)row.branch=next;if(selectedBranch==='b:'+name)selectedBranch='b:'+next;save();updateBranches();applyFilter();renderBranchList();$('branch-error').textContent='نام اور متعلقہ انٹریاں اپ ڈیٹ ہو گئیں۔';};
      const remove=document.createElement('button');remove.textContent='ہٹائیں';remove.onclick=()=>{if(state.rows.some(r=>r.branch===name&&populated(r))||state.trash.some(t=>t.row.branch===name)){$('branch-error').textContent='اس پارٹی کی انٹریاں موجود ہیں؛ پہلے ان کی پارٹی تبدیل کریں۔';return;}state.rows.forEach(r=>{if(r.branch===name)r.branch='';});state.branches=state.branches.filter(n=>n!==name);if(state.partyCurrencies)delete state.partyCurrencies[name];if(selectedBranch==='b:'+name)selectedBranch='';save();updateBranches();applyFilter();renderBranchList();$('branch-error').textContent='پارٹی ہٹا دی گئی۔';};div.append(input,currSelect,count,rename,remove);$('branch-list').append(div);
    }
  }
  $('branch-form').onsubmit=e=>{e.preventDefault();const name=cleanName($('branch-name').value);if(!name)return;const existing=state.branches.find(n=>nameKey(n)===nameKey(name));if(existing){$('branch-error').textContent='یہ پارٹی پہلے سے موجود ہے؛ فہرست سے منتخب کریں۔';return;}const curr=$('branch-currency')?.value||'pkr';state.branches.push(name);if(!state.partyCurrencies)state.partyCurrencies={};state.partyCurrencies[name]=curr;if(pendingBranchRow)pendingBranchRow.branch=name;else selectedBranch='b:'+name;save();updateBranches();applyFilter(true);renderBranchList();$('branch-name').value='';$('branch-error').textContent='پارٹی شامل ہو گئی ('+(curr==='afn'?'افغانی':'روپیہ')+')۔';if(pendingBranchRow){const target=pendingBranchRow;$('branch-dialog').close();focusRow(target);}else{$('branch-dialog').close();}};
  function preparePrint(){applyFilter();const datePrint=$('date-print-val');if(datePrint)datePrint.textContent=fmtDate($('date').value||today());document.querySelectorAll('.print-value').forEach(e=>e.remove());state.rows.forEach(row=>{const tr=rowNodes.get(row.id);tr.classList.toggle('empty-row',!matches(row));tr.querySelectorAll('input,select,textarea').forEach(input=>{const span=document.createElement('span');span.className='print-value';span.textContent=input.classList.contains('amount')?wholeText(input.value):input.value;if(['amount','phone'].some(c=>input.classList.contains(c))){span.dir='ltr';span.style.textAlign='right';}if(input.dataset.field==='place'){span.style.textAlign='center';}input.after(span);});});}
  window.addEventListener('beforeprint',preparePrint);window.addEventListener('afterprint',()=>applyFilter());
  function canOutput(rows,filtered=true){if(filtered&&!rangeValid()){alert('تاریخ کا دورانیہ درست کریں۔');return false;}if(!rows.length){alert('کوئی انٹری منتخب نہیں ہے۔');return false;}if(rows.some(r=>moneyFields.some(f=>integerAmount(r[f])===null))){alert('رقم کے خانے درست کریں۔ صرف مکمل عدد لکھیں؛ پرانی اعشاری رقم خود تبدیل نہیں کی گئی۔');return false;}return true;}
  $('print').onclick=async()=>{if(canOutput(selectedRows())){await document.fonts.ready;window.print();}};
  window.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&(e.key==='p'||e.key==='P')){e.preventDefault();$('print').click();}
    if((e.ctrlKey||e.metaKey)&&(e.key==='z'||e.key==='Z')&&!e.shiftKey){
      const active=document.activeElement;
      const inInput=active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.isContentEditable);
      if(!inInput&&state.trash.length){e.preventDefault();$('undo').click();}
    }
  });
  if(window.electronAPI?.onMenuAction){
    window.electronAPI.onMenuAction(action=>{
      if(action==='add-row')add();
      else if(action==='print')$('print').click();
      else if(action==='export')$('export-open').click();
      else if(action==='summary')openSummary();
      else if(action==='branches')openBranches();
      else if(action==='reset-filters')resetFilters();
    });
  }
  function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function backup(){const time=new Date().toISOString();const snapshot={...state,rows:state.rows.filter(populated),lastBackupAt:time};download(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}),`hisaab-backup-${today()}.json`);state.lastBackupAt=time;save();updateBackup();}
  $('backup').onclick=backup;$('backup-now').onclick=backup;setInterval(updateBackup,60000);
  $('restore').onclick=()=>$('file').click();
  $('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>15000000)throw Error('Large file');const data=migrate(JSON.parse(await file.text()));if(!confirm('موجودہ رجسٹر بیک اَپ سے بدل جائے گا۔ جاری رکھیں؟'))return;state=data;storageBlocked=false;selectedBranch='';for(const id of ['search','date-from','date-to'])$(id).value='';save();render();}catch{alert('یہ درست حساب بیک اَپ نہیں ہے۔ موجودہ ڈیٹا تبدیل نہیں ہوا۔');}finally{e.target.value='';}};
  $('export-open').onclick=()=>$('export-dialog').showModal();$('close-export').onclick=()=>$('export-dialog').close();
  function exportExcel(all){const rows=all?state.rows.filter(populated):selectedRows();if(!canOutput(rows,!all))return;const start=Number(state.startSerial)||1;const curr=activeCurrency();const currLabel=(!all&&curr==='afn')?'افغانی':'روپیہ';const dynLabels=['ارسال کنندہ','موبائیل نمبر','وصول کنندہ','مقام','پارٹی','بقایا','درہم',currLabel];const headers=['سریل نمبر','تاریخ',...dynLabels];const data=rows.map((r,i)=>[start+i,r.entryDate||state.date,...fields.map(f=>moneyFields.includes(f)?{number:String(integerAmount(r[f]))}:r[f])]);const sums=moneyFields.map(f=>rows.reduce((n,r)=>n+integerAmount(r[f]),0n));const tail=['کل مجموعہ حساب','','','','','','',...sums.map(n=>({number:String(n)}))];download(window.HisaabExcel.create([headers,...data,tail]),`hisaab-${all?'all':'filtered'}-${today()}.xlsx`);$('export-dialog').close();}
  $('export-filtered').onclick=()=>exportExcel(false);$('export-all').onclick=()=>exportExcel(true);
  render();save();
})();
