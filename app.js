(() => {
  'use strict';
  const KEY = 'hisaab-register-v1';
  const $ = id => document.getElementById(id);
  const nativeStorage=window.electronAPI?.storage;
  let storageRevision=0,nativeNeedsInit=false,legacySource=null,storageReadFailed=false,unsavedNative=false;
  let autoBackupTimer=null,autoBackupHandle=null,diskWriteBusy=false,diskWritePending=false,diskSyncTimer=null,pendingDiskHandle=null,unsavedDisk=false;
  const retrySave=document.createElement('button');retrySave.type='button';retrySave.id='retry-save';retrySave.textContent='دوبارہ محفوظ کریں';retrySave.hidden=true;
  const reconnectDiskBtn=document.createElement('button');reconnectDiskBtn.type='button';reconnectDiskBtn.id='reconnect-disk-file';reconnectDiskBtn.hidden=true;
  $('save-state').after(retrySave,reconnectDiskBtn);
  const rowFields = ['orderType','balanceType','entryDate','sender','mobile','receiver','place','branch','balance','aed','pkr'];
  const fields = ['sender','mobile','receiver','place','branch','balance','aed','pkr'];
  const labels = ['ارسال کنندہ','موبائیل نمبر','وصول کنندہ','مقام','پارٹی','بقایا','درہم','روپیہ'];
  const moneyFields = ['balance','aed','pkr'];
  const populated = r => ['sender','mobile','receiver','place',...moneyFields].some(f => r[f].trim());
  const formatAllah = value => String(value).replace(/(^|[\s\u060C\u06D4()\-]|\u0639\u0628\u062F|\u0621)\u0627\u0644\u0644[\u0651\u0670]*[\u06C1\u0647](?=$|[\s\u060C\u06D4()\-])/g, '$1\uFDF2');
  const cleanName = value => formatAllah(value).trim().replace(/\s+/g,' ');
  const nameKey = value => cleanName(value).toLocaleLowerCase();
  const uid = () => crypto.randomUUID();
  function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function dateValid(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(`${s}T12:00:00Z`);return !isNaN(d)&&d.toISOString().slice(0,10)===s;}
  function englishDigits(v){return v.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/٫/g,'.').replace(/٬/g,',');}
  function normalized(v){return englishDigits(v).replace(/[,\s]/g,'');}
  function integerAmount(v){const n=normalized(v);if(!n)return 0n;if(!/^-?\d{1,12}(\.0{1,2})?$/.test(n))return null;return BigInt(n.split('.')[0]);}
  function wholeText(v){const n=integerAmount(v);return v.trim()&&n!==null?formatted(n):v;}
  function formatted(n){return n.toLocaleString('en-IN');}
  function blank(branch=''){return {...Object.fromEntries(rowFields.map(f=>[f,''])),id:uid(),entryDate:state.date||today(),branch};}
  function fmtDate(iso){if(!iso)return '';const [y,m,d]=iso.split('-');return `${d}/${m}/${y}`;}
  let journalController=null;
  let state={journal:{date:today(),rows:[]},version:4,title:'Hisaab Register',date:today(),pageNumber:1,startSerial:1,partySerials:Object.create(null),fontSize:13,branches:[],partyCurrencies:Object.create(null),rows:[],trash:[],lastBackupAt:null,lockedDates:[],pinCode:''};
  function activePageNumber(){return (Number(state.pageNumber)||1)+(viewPage||0);}
  const partyCurrency=name=>name&&Object.hasOwn(state.partyCurrencies||{},name)&&state.partyCurrencies[name]==='afn'?'afn':'pkr';
  function currencyTotals(rows){const sums={pkr:0n,afn:0n},invalid=new Set();for(const r of rows){const c=partyCurrency(r.branch),v=integerAmount(r.pkr);if(v===null)invalid.add(c);else sums[c]+=v;}return {sums,invalid};}
  function currencyText(rows){const currencies=[...new Set(rows.map(r=>partyCurrency(r.branch)))];const {sums,invalid}=currencyTotals(rows);return (currencies.length?currencies:['pkr']).map(c=>(currencies.length>1?c.toUpperCase()+': ':'')+(invalid.has(c)?'رقم درست کریں':formatted(sums[c]))).join('\n');}
  const activeCurrency=()=>selectedBranch.startsWith('b:')?partyCurrency(selectedBranch.slice(2)):'pkr';
  let storageBlocked=false, selectedBranch='', pendingBranchRow=null;
  function activeStartSerial(){
    if(!state.partySerials)state.partySerials=Object.create(null);
    if(selectedBranch.startsWith('b:')){const name=selectedBranch.slice(2);return Number.isInteger(state.partySerials[name])&&state.partySerials[name]>0?state.partySerials[name]:1;}
    if(selectedBranch==='__unassigned')return Number.isInteger(state.partySerials.__unassigned)&&state.partySerials.__unassigned>0?state.partySerials.__unassigned:1;
    return Number(state.startSerial)||1;
  }
  function setActiveStartSerial(val){
    const n=(!isNaN(val)&&val>0)?val:1;
    if(!state.partySerials)state.partySerials=Object.create(null);
    if(selectedBranch.startsWith('b:'))state.partySerials[selectedBranch.slice(2)]=n;
    else if(selectedBranch==='__unassigned')state.partySerials.__unassigned=n;
    else state.startSerial=n;
    return n;
  }
  const rowNodes=new Map();
  const pageSize=200;
  let viewPage=0,viewKey='',registerPrintActive=false;
  const pageNav=document.createElement('div');pageNav.className='register-pagination no-print';pageNav.hidden=true;
  const pagePrev=document.createElement('button'),pageNext=document.createElement('button'),pageLabel=document.createElement('span');
  pagePrev.type=pageNext.type='button';pagePrev.textContent='پچھلا صفحہ';pageNext.textContent='اگلا صفحہ';
  pagePrev.id='register-page-prev';pageNext.id='register-page-next';pageLabel.id='register-page-label';
  pageNav.append(pagePrev,pageLabel,pageNext);document.querySelector('.table-wrap').after(pageNav);
  pagePrev.onclick=()=>{viewPage=Math.max(0,viewPage-1);applyFilter();};
  pageNext.onclick=()=>{viewPage++;applyFilter();};
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
      rowFields.forEach(f=>{const v=row[f]===undefined&&['orderType','balanceType','entryDate','branch'].includes(f)?'':row[f];if(typeof v!=='string'||v.length>300)throw Error('Invalid field');result[f]=['sender','receiver','place','balanceType'].includes(f)?formatAllah(v):v;});
      if(!['','bank','city'].includes(result.orderType))throw Error('Invalid order type');
      if(result.entryDate&&!dateValid(result.entryDate))throw Error('Invalid date');
      if(!result.entryDate)result.entryDate=source.date||today();
      result.branch=register(result.branch);
      for(const f of [...moneyFields,'mobile'])result[f]=moneyFields.includes(f)?wholeText(englishDigits(result[f])):englishDigits(result[f]);
      result.history=Array.isArray(row.history)?row.history.slice(-30).map(h=>({at:String(h.at||''),field:String(h.field||''),from:String(h.from||''),to:String(h.to||'')})):[];
      result.id=typeof row.id==='string'&&row.id.length<100&&!ids.has(row.id)?row.id:uid();ids.add(result.id);return result;
    }
    const rows=source.rows.map(convert);
    if(source.version===3)rows.reverse();
    if(source.trash!==undefined&&(!Array.isArray(source.trash)||source.trash.length>20))throw Error('Invalid undo');
    const trash=(source.trash||[]).map(item=>{if(!item||!Number.isInteger(item.index)||item.index<0)throw Error('Invalid undo');return {row:convert(item.row),index:item.index};});
    const startSerial=Number.isInteger(source.startSerial)&&source.startSerial>0?source.startSerial:1;
    const partySerials=Object.create(null);
    if(source.partySerials&&typeof source.partySerials==='object'){
      for(const name of registry){if(Object.hasOwn(source.partySerials,name)&&Number.isInteger(source.partySerials[name])&&source.partySerials[name]>0)partySerials[name]=source.partySerials[name];}
      if(Object.hasOwn(source.partySerials,'__unassigned')&&Number.isInteger(source.partySerials.__unassigned)&&source.partySerials.__unassigned>0)partySerials.__unassigned=source.partySerials.__unassigned;
    }
    const partyCurrencies=Object.create(null);for(const name of registry){const raw=source.partyCurrencies;if(raw&&Object.hasOwn(raw,name)){if(!['pkr','afn'].includes(raw[name]))throw Error('Invalid currency');partyCurrencies[name]=raw[name];}}
    const lockedDates=Array.isArray(source.lockedDates)?source.lockedDates.filter(d=>typeof d==='string'&&dateValid(d)):[];
    const pinCode=typeof source.pinCode==='string'&&/^\d{4,8}$/.test(source.pinCode)?source.pinCode:'';
    const titleVal = (!source.title || source.title === 'اندراج رجسٹر') ? 'Hisaab Register' : formatAllah(source.title);
    return {journal:window.HisaabJournal.normalize(source.journal,source.date||today()),version:4,title:titleVal,date:source.date||today(),pageNumber:Number.isInteger(source.pageNumber)&&source.pageNumber>0?source.pageNumber:1,startSerial,partySerials,fontSize:Number.isInteger(source.fontSize)?Math.max(10,Math.min(22,source.fontSize)):13,branches:registry,partyCurrencies,rows,trash,lastBackupAt:typeof source.lastBackupAt==='string'&&Number.isFinite(Date.parse(source.lastBackupAt))?source.lastBackupAt:null,lockedDates,pinCode};
  }
  const isWebMode = !nativeStorage && window.location.protocol.startsWith('http');
  const AUTH_KEY = 'hisaab-auth-token-v1';
  const getAuthToken = () => localStorage.getItem(AUTH_KEY) || '';
  const setAuthToken = token => {
    if (token) localStorage.setItem(AUTH_KEY, token);
    else localStorage.removeItem(AUTH_KEY);
    updateLogoutBtn();
  };
  function updateLogoutBtn() {
    if ($('logout-btn')) $('logout-btn').hidden = !isWebMode || !getAuthToken();
  }
  let mongoSaveTimer = null, pendingMongoSave = null;

  async function pushToMongo(cleanState, force=false) {
    if (!isWebMode) return;
    try {
      $('save-state').textContent = 'کلاؤڈ پر محفوظ ہو رہا ہے...';
      const token = getAuthToken();
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify({ state: cleanState, revision: storageRevision, force })
      });
      if (res.status === 401) {
        setAuthToken('');
        requestWebLogin('لاگ ان کی مدت ختم ہو گئی۔ براہ کرم دوبارہ پن درج کریں۔');
        return;
      }
      if (res.status === 409) {
        const conflictData = await res.json();
        console.warn('Concurrent edit conflict detected:', conflictData);
        unsavedNative = true;
        $('save-state').textContent = '⚠️ تضاد: سرور پر نیا ڈیٹا موجود ہے';
        retrySave.hidden = false;
        retrySave.textContent = 'نیا ڈیٹا لوڈ کریں';
        retrySave.onclick = () => {
          if (confirm('سرور پر نیا ڈیٹا آ چکا ہے۔ کیا آپ نیا ڈیٹا لوڈ کرنا چاہتے ہیں؟ (آپ کی مقامی غیر محفوظ تبدیلیاں تبدیل ہو جائیں گی)')) {
            storageRevision = conflictData.serverRevision || 0;
            if (conflictData.serverState) {
              state = migrate(conflictData.serverState);
              localStorage.setItem(KEY, JSON.stringify(state));
              render();
            }
            savedStatus();
          }
        };
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const result = await res.json();
      if (result.status === 'saved') {
        storageRevision = result.revision;
        unsavedNative = false;
        savedStatus();
      }
    } catch (err) {
      console.warn('MongoDB save error:', err);
      unsavedNative = true;
      $('save-state').textContent = 'لوکل محفوظ — کلاؤڈ سنک ناکام';
      retrySave.hidden = false;
      retrySave.textContent = 'دوبارہ محفوظ کریں';
      retrySave.onclick = () => { if (storageReadFailed) location.reload(); else save(); };
    }
  }

  function scheduleMongoSave(cleanState) {
    if (!isWebMode) return;
    pendingMongoSave = cleanState;
    clearTimeout(mongoSaveTimer);
    mongoSaveTimer = setTimeout(() => {
      const data = pendingMongoSave;
      pendingMongoSave = null;
      pushToMongo(data);
    }, 400);
  }

  try{
    if(nativeStorage){
      const loaded=nativeStorage.load();
      if(loaded?.status!=='ok')throw Error(loaded?.message||'Database unavailable');
      storageRevision=loaded.revision;nativeNeedsInit=loaded.state===null;
      $('save-state').title=loaded.filePath;
      if(nativeNeedsInit){legacySource=localStorage.getItem(KEY);if(legacySource)state=migrate(JSON.parse(legacySource));}
      else state=migrate(loaded.state);
      const help=$('storage-help');if(help)help.textContent='ڈیٹا اسی کمپیوٹر کی SQLite فائل میں محفوظ ہے؛ دوسرے کمپیوٹر کے لیے بیک اَپ لے کر بحال کریں۔';
    }else{
      const raw=localStorage.getItem(KEY);if(raw)state=migrate(JSON.parse(raw));
      if(isWebMode){
        const help=$('storage-help');if(help)help.textContent='ڈیٹا کلاؤڈ MongoDB Atlas سے منسلک ہو رہا ہے...';
      }
    }
  }catch{storageBlocked=true;storageReadFailed=true;alert('محفوظ ڈیٹا نہیں کھل سکا۔ اصل ڈیٹا محفوظ رکھا گیا ہے؛ دوبارہ کھولیں یا درست بیک اَپ بحال کریں۔');}
  function writeState(data,restore=false){
    if(!nativeStorage){
      localStorage.setItem(KEY,JSON.stringify(data));
      if(isWebMode){
        if(restore) pushToMongo(data);
        else scheduleMongoSave(data);
      }
      return;
    }
    const result=nativeNeedsInit?nativeStorage.initialize(data,legacySource,storageRevision):restore?nativeStorage.restore(data,storageRevision,state):nativeStorage.save(data,storageRevision);
    if(result?.status!=='saved')throw Error(result?.message||'Database save failed');
    storageRevision=result.revision;nativeNeedsInit=false;unsavedNative=false;
  }
  function savedStatus(){
    retrySave.hidden=true;
    retrySave.textContent='دوبارہ محفوظ کریں';
    retrySave.onclick=()=>{if(storageReadFailed)location.reload();else save();};
    $('save-state').textContent=nativeStorage?'✓ SQLite میں محفوظ ہے':isWebMode?'✓ MongoDB Atlas میں محفوظ ہے':autoBackupHandle?'✓ پی سی فائل میں محفوظ ہے':'✓ محفوظ ہے';
    if(!nativeStorage&&autoBackupHandle)$('save-state').title=autoBackupHandle.name;
    if(isWebMode)$('save-state').title='MongoDB Atlas Cloud Database';
  }
  function persist(){
    if(storageBlocked){$('save-state').textContent='محفوظ نہیں ہو رہا — دوبارہ کھولیں یا بیک اَپ بحال کریں';retrySave.hidden=false;return false;}
    try{writeState({...state,rows:state.rows.filter(populated)});savedStatus();return true;}
    catch{unsavedNative=!!nativeStorage;retrySave.hidden=false;$('save-state').textContent='محفوظ نہیں ہو سکا — دوبارہ کوشش کریں یا بیک اَپ لیں';return false;}
  }
  function save(){const ok=persist();if(ok){scheduleDiskSync();scheduleAutoBackup();}return ok;}
  retrySave.onclick=()=>{if(storageReadFailed)location.reload();else save();};
  window.addEventListener('beforeunload',event=>{if(unsavedNative||unsavedDisk){event.preventDefault();event.returnValue='';}});
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
    const query=formatAllah(englishDigits($('search').value)).trim().toLocaleLowerCase();
    if(!query)return true;
    const text=formatAllah([r.sender,r.receiver,r.mobile,r.place,r.branch].join(' ')).toLocaleLowerCase();
    const phoneQuery=query.replace(/[\s()+-]/g,'');
    return text.includes(query)||(/^\d+$/.test(phoneQuery)&&r.mobile.replace(/[\s()+-]/g,'').includes(phoneQuery));
  }
  function matches(r){return populated(r)&&branchMatch(r)&&rangeValid()&&dateMatch(r)&&queryMatch(r);}
  const selectedRows=()=>state.rows.filter(matches);
  function makeOption(value,label){const option=document.createElement('option');option.value=value;option.textContent=label;return option;}
  function branchOptions(select,value,filter=false){select.replaceChildren(...(filter?[makeOption('__unassigned','بغیر پارٹی')]:[makeOption('','بغیر پارٹی')]),...state.branches.slice().sort((a,b)=>a.localeCompare(b,'ur')).map(n=>makeOption(filter?'b:'+n:n,n)));if(!filter)select.append(makeOption('__new_party__','＋ نئی پارٹی'));select.value=value;}
  function ensureActiveParty(){
    const branches=state.branches||[];
    const hasBranch=selectedBranch&&selectedBranch.startsWith('b:')&&branches.includes(selectedBranch.slice(2));
    if(hasBranch||selectedBranch==='__unassigned')return;
    const sorted=branches.slice().sort((a,b)=>a.localeCompare(b,'ur'));
    if(sorted.length>0){
      selectedBranch='b:'+sorted[0];
    }else{
      selectedBranch='__unassigned';
    }
  }
  function partyDateCounts(){
    const byBranch=new Map();
    let allCount=0,unassignedCount=0;
    if(rangeValid()){
      for(const r of state.rows){
        if(!populated(r)||!dateMatch(r))continue;
        allCount++;
        if(!r.branch)unassignedCount++;
        else byBranch.set(r.branch,(byBranch.get(r.branch)||0)+1);
      }
    }
    return {allCount,unassignedCount,byBranch};
  }

  function renderPartyTabs(){
    const container=$('party-tabs');
    if(!container)return;
    ensureActiveParty();
    container.replaceChildren();

    const {unassignedCount,byBranch}=partyDateCounts();
    const sorted=state.branches.slice().sort((a,b)=>a.localeCompare(b,'ur'));
    for(const name of sorted){
      const tab=document.createElement('button');tab.type='button';const isSel=selectedBranch==='b:'+name;tab.className='party-tab'+(isSel?' active':'');tab.role='tab';tab.setAttribute('aria-selected',isSel?'true':'false');
      const count=byBranch.get(name)||0;
      const isAfn=partyCurrency(name)==='afn';
      const title=document.createElement('span');title.textContent='🏢 '+name;tab.append(title);if(isAfn){const tag=document.createElement('span');tag.className='tab-curr-tag';tag.textContent='افغانی';tab.append(tag);}const badge=document.createElement('span');badge.className='tab-badge';badge.textContent=count;tab.append(badge);
      tab.onclick=()=>selectPartyTab('b:'+name);
      container.append(tab);
    }
    if(unassignedCount>0||selectedBranch==='__unassigned'||sorted.length===0){
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
    const pages=Math.max(1,Math.ceil(selectedRows().length/pageSize));
    if(viewPage!==pages-1){viewPage=pages-1;applyFilter();}
    updatePartyTabsActive();
    const draft=state.rows.find(r=>branchMatch(r)&&!populated(r));
    if(draft)focusRow(draft);
  }
  function updatePartyTabsActive(){
    const container=$('party-tabs');
    if(!container)return;

    const sorted=state.branches.slice().sort((a,b)=>a.localeCompare(b,'ur'));
    const {unassignedCount,byBranch}=partyDateCounts();
    const hasUnassigned=unassignedCount>0||selectedBranch==='__unassigned'||sorted.length===0;
    const expectedCount=sorted.length+(hasUnassigned?1:0);
    if(container.children.length!==expectedCount){renderPartyTabs();return;}
    Array.from(container.children).forEach((tab,i)=>{
      let tabVal=i<sorted.length?'b:'+sorted[i]:'__unassigned';
      const isSel=selectedBranch===tabVal;
      tab.classList.toggle('active',isSel);
      tab.setAttribute('aria-selected',isSel?'true':'false');
      const badge=tab.querySelector('.tab-badge');
      if(badge)badge.textContent=i<sorted.length?(byBranch.get(sorted[i])||0):unassignedCount;
    });
  }
  function updateBranches(){ensureActiveParty();branchOptions($('branch-filter'),selectedBranch,true);state.rows.forEach(row=>{const select=rowNodes.get(row.id)?.querySelector('[data-field="branch"]');if(select)branchOptions(select,row.branch);});renderPartyTabs();}
  function orderTypeRank(type){
    if(type==='bank')return 0;
    if(type==='city')return 1;
    return 2;
  }
  function groupRows(rows){
    const populatedRows=rows.filter(populated);
    const draftRows=rows.filter(r=>!populated(r));
    populatedRows.sort((a,b)=>orderTypeRank(a.orderType||'')-orderTypeRank(b.orderType||''));
    return [...populatedRows,...draftRows];
  }
  function ensureDraft(){
    // Keep rows grouped by order type, unpopulated draft row at the bottom
    state.rows=groupRows(state.rows);
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
  function totals(rows=selectedRows()){let totalBalance=0n,totalAed=0n,invalidAny=false;const byType=new Map();for(const field of moneyFields){let total=0n,invalid=false;for(const row of rows){const value=integerAmount(row[field]);if(value===null)invalid=true;else{total+=value;if(field==='balance'&&row.balanceType&&row.balanceType.trim()&&value>0n){const t=row.balanceType.trim();byType.set(t,(byType.get(t)||0n)+value);}}}if(field==='balance'){totalBalance=total;if(invalid)invalidAny=true;}if(field==='aed'){totalAed=total;if(invalid)invalidAny=true;}$('total-'+field).textContent=invalid?'رقم درست کریں':formatted(total);}const balEl=$('total-balance');if(balEl&&!invalidAny){const parts=[];for(const [name,sum] of byType){parts.push(`${name}: ${formatted(sum)}`);}balEl.title=parts.length?`کل بقایا: ${formatted(totalBalance)} (${parts.slice(0,4).join(' | ')}${parts.length>4?'...':''})`:`کل بقایا: ${formatted(totalBalance)}`;}const netEl=$('total-net-aed');if(netEl){const netAed=totalAed-totalBalance;netEl.textContent=invalidAny?'موجودہ درہم: رقم درست کریں':`موجودہ درہم: ${formatted(netAed)}`;}const ordersEl=$('total-orders-count');if(ordersEl){ordersEl.textContent=`آرڈرز تعداد: ${rows.length}`;}$('total-pkr').textContent=currencyText(rows).split('\n').map(s=>`(${s})`).join('\n');$('count').textContent=`${rows.length} اندراجات`;
    const fractional=rows.some(r=>moneyFields.some(f=>integerAmount(r[f])===null));
    $('filter-message').textContent=!rangeValid()?'تاریخ سے، تاریخ تک سے آگے نہیں ہو سکتی۔':dayMode()?`${fmtDate(state.date)} کی ${rows.length} انٹریاں۔ پرنٹ اور مجموعہ انہی کا ہے۔`:`${rows.length} انٹریاں منتخب ہیں۔ پرنٹ اور مجموعہ انہی کا ہے۔ نئی انٹری کے لیے "＋ نئی قطار" دبائیں۔`;
    if(fractional)$('filter-message').textContent+=' رقم میں صرف مکمل عدد لکھیں؛ پرانی اعشاری رقم کو خود نہیں بدلا گیا۔';
    $('filter-message').classList.toggle('error',!rangeValid()||fractional);
  }
  function updateBalTypeSuggestions(){let dl=$('bal-type-suggestions');if(!dl){dl=document.createElement('datalist');dl.id='bal-type-suggestions';document.body.append(dl);}const set=new Set(['کھاتہ','عارضی قرضہ']);state.rows.forEach(r=>{if(r.balanceType&&r.balanceType.trim())set.add(r.balanceType.trim());});dl.replaceChildren(...Array.from(set).map(val=>{const opt=document.createElement('option');opt.value=val;return opt;}));}
  function viewLabel(){
    if(rangeActive())return [$('date-from').value?fmtDate($('date-from').value):'شروع',$('date-to').value?fmtDate($('date-to').value):'آج تک'].join(' — ');
    return $('all-dates').checked?'تمام تاریخیں':fmtDate(state.date);
  }
  const fieldUrduLabels={orderType:'آرڈر کی قسم',balanceType:'بقایا کی نوعیت',sender:'ارسال کنندہ',mobile:'موبائیل نمبر',receiver:'وصول کنندہ',place:'مقام',branch:'پارٹی',balance:'بقایا',aed:'درہم',pkr:'روپیہ / افغانی'};
  // Keep the first two entries per key: enough to find the earliest other row,
  // including the original asymmetric rule for rows with no phone or no money.
  const duplicateRecords=new WeakMap(),duplicateAccepted=new Map();
  const duplicateSignature=r=>JSON.stringify([r.entryDate,r.branch,r.sender,r.mobile,r.balance,r.aed,r.pkr]);
  let duplicatePending=[];
  function reviewDuplicates(rows,lookup){
    duplicatePending=rows.filter(r=>lookup(r)&&duplicateAccepted.get(r.id)!==duplicateSignature(r));
    const banner=$('duplicate-warning');banner.hidden=!duplicatePending.length;
    $('duplicate-warning-text').textContent=duplicatePending.length+' ممکنہ دہرے اندراجات: اسی تاریخ اور پارٹی میں ملتا جلتا نام، موبائل یا رقم موجود ہے۔ انٹریاں محفوظ ہیں؛ جائزہ لے کر درست کریں یا برقرار رکھیں۔';
  }
  $('duplicate-keep').onclick=()=>{for(const r of duplicatePending)duplicateAccepted.set(r.id,duplicateSignature(r));applyFilter();};
  $('duplicate-review').onclick=()=>{const r=duplicatePending[0];if(!r)return;const rows=selectedRows();viewPage=Math.floor(rows.findIndex(x=>x.id===r.id)/pageSize);applyFilter();focusRow(r);};
  function duplicateLookup(){
    const exact=new Map(),withoutPhone=new Map(),phoneOnly=new Map(),keys=new Map();
    const add=(map,key,item)=>{const list=map.get(key);if(!list)map.set(key,[item]);else if(list.length<2)list.push(item);};
    let index=0;
    for(const row of state.rows){
      if(!populated(row))continue;
      const item={id:row.id,index:(Number(state.startSerial)||1)+index++};
      let record=duplicateRecords.get(row);
      if(!record||['sender','mobile','branch','entryDate',...moneyFields].some(f=>record.raw[f]!==row[f])){
        const sender=cleanName(row.sender).toLowerCase(),phone=englishDigits(row.mobile).replace(/\D/g,'');
        const values=moneyFields.map(f=>integerAmount(row[f])||0n),hasMoney=values.some(v=>v>0n),amounts=values.map(String);
        record={raw:{branch:row.branch,entryDate:row.entryDate,sender:row.sender,mobile:row.mobile,balance:row.balance,aed:row.aed,pkr:row.pkr},sender,phone,hasMoney,fullKey:JSON.stringify([row.entryDate,row.branch,sender,phone,...amounts]),amountKey:JSON.stringify([row.entryDate,row.branch,sender,...amounts]),phoneKey:JSON.stringify([row.entryDate,row.branch,sender,phone])};
        duplicateRecords.set(row,record);
      }
      const {sender,phone,hasMoney,fullKey,amountKey,phoneKey}=record;
      add(exact,fullKey,item);add(withoutPhone,amountKey,item);add(phoneOnly,phoneKey,item);
      if(sender&&(hasMoney||phone.length>=7))keys.set(row.id,{map:hasMoney?(phone?exact:withoutPhone):phoneOnly,key:hasMoney?(phone?fullKey:amountKey):phoneKey});
    }
    return row=>{const entry=keys.get(row.id);return entry?entry.map.get(entry.key)?.find(item=>item.id!==row.id):null;};
  }
  const isDayLocked=d=>!!(state.lockedDates&&state.lockedDates.includes(d||state.date));
  function updateLockBtn(){
    const btn=$('lock-day');
    if(!btn)return;
    const locked=isDayLocked(state.date);
    btn.textContent=locked?'🔒 دن لاک ہے (محفوظ)':'🔓 دن کھلا ہے';
    btn.classList.toggle('is-locked',locked);
    btn.title=locked?'یہ تاریخ لاک ہے، ترمیم کے لیے کلک کر کے ان لاک کریں':'اس تاریخ کا رجسٹر لاک کریں تاکہ غلطی سے ترمیم نہ ہو';
  }
  let pinUnlockResolve=null;
  function updatePinUI(){
    const hasPin=!!state.pinCode;
    if($('lock-app-now-btn'))$('lock-app-now-btn').hidden=!hasPin;
    updateLogoutBtn();
  }
  let webLoginResolve = null;
  let isWebSetupMode = false;
  function requestWebLogin(reasonText='جاری رکھنے کے لیے اپنا پاس ورڈ / پن کوڈ درج کریں', setupMode=false) {
    isWebSetupMode = !!setupMode;
    const overlay=$('pin-lock-overlay');
    if(!overlay)return Promise.resolve(false);
    $('pin-unlock-title').textContent=isWebSetupMode?'حساب — نیا پن سیٹ کریں':'حساب — لاگ ان';
    $('pin-unlock-reason').textContent=reasonText;
    $('pin-unlock-error').textContent='';
    const input=$('pin-unlock-input');
    input.value='';
    const cancelBtn=$('pin-unlock-cancel');
    if(cancelBtn)cancelBtn.hidden=true;
    overlay.hidden=false;
    document.querySelectorAll('body > :not(#pin-lock-overlay)').forEach(el=>{el.inert=true;});
    setTimeout(()=>input.focus(),30);
    return new Promise(resolve=>{webLoginResolve=resolve;});
  }
  function requestPinUnlock(reasonText='جاری رکھنے کے لیے اپنا حفاظتی پن کوڈ (PIN) درج کریں',allowCancel=false){
    if(!state.pinCode)return Promise.resolve(true);
    const overlay=$('pin-lock-overlay');
    if(!overlay)return Promise.resolve(true);
    $('pin-unlock-title').textContent='حساب لاک ہے';
    $('pin-unlock-reason').textContent=reasonText;
    $('pin-unlock-error').textContent='';
    const input=$('pin-unlock-input');
    input.value='';
    const cancelBtn=$('pin-unlock-cancel');
    if(cancelBtn)cancelBtn.hidden=!allowCancel;
    overlay.hidden=false;
    document.querySelectorAll('body > :not(#pin-lock-overlay)').forEach(el=>{el.inert=true;});
    setTimeout(()=>input.focus(),20);
    return new Promise(resolve=>{pinUnlockResolve=resolve;});
  }
  function finishPinUnlock(unlocked){
    const overlay=$('pin-lock-overlay');
    if(overlay)overlay.hidden=true;
    document.querySelectorAll('body > :not(#pin-lock-overlay)').forEach(el=>{el.inert=false;});
    if(pinUnlockResolve){const fn=pinUnlockResolve;pinUnlockResolve=null;fn(unlocked);}
  }
  if($('pin-unlock-input')){
    $('pin-unlock-input').addEventListener('input',()=>{
      $('pin-unlock-error').textContent='';
    });
  }
  if($('toggle-pwd-btn')){
    $('toggle-pwd-btn').onclick=()=>{
      const input=$('pin-unlock-input');
      const isPwd=input.type==='password';
      input.type=isPwd?'text':'password';
      $('toggle-pwd-btn').textContent=isPwd?'🔒':'👁';
    };
  }
  if($('pin-unlock-form')){
    $('pin-unlock-form').onsubmit=async e=>{
      e.preventDefault();
      const val=englishDigits($('pin-unlock-input').value).trim();
      if(!val)return;

      if(isWebMode&&webLoginResolve){
        $('pin-unlock-error').textContent=isWebSetupMode?'نیا پن محفوظ ہو رہا ہے...':'لاگ ان ہو رہا ہے...';
        try{
          if(isWebSetupMode){
            if(val.length < 4){
              $('pin-unlock-error').textContent='نیا پن کم از کم 4 ہندسوں یا حروف کا ہونا چاہیے۔';
              return;
            }
            const res=await fetch('/api/auth/setup',{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({newPassword:val})
            });
            const data=await res.json();
            if(res.ok&&data.status==='ok'&&data.token){
              setAuthToken(data.token);
              isWebSetupMode=false;
              finishPinUnlock(true);
              if(webLoginResolve){
                const fn=webLoginResolve;
                webLoginResolve=null;
                fn(true);
              }
              initMongoWebState();
              return;
            }
            $('pin-unlock-error').textContent=data.message||'پن محفوظ نہیں ہو سکا!';
            $('pin-unlock-input').select();
            return;
          }

          const res=await fetch('/api/auth/login',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({password:val})
          });
          const data=await res.json();
          if(res.ok&&data.status==='ok'&&data.token){
            setAuthToken(data.token);
            finishPinUnlock(true);
            if(webLoginResolve){
              const fn=webLoginResolve;
              webLoginResolve=null;
              fn(true);
            }
            initMongoWebState();
            return;
          }
          if(data.needsSetup){
            isWebSetupMode=true;
            $('pin-unlock-title').textContent='حساب — نیا پن سیٹ کریں';
            $('pin-unlock-reason').textContent='پہلی بار کے استعمال کے لیے نیا پن کوڈ سیٹ کریں (کم از کم 4 ہندسے)';
            $('pin-unlock-error').textContent=data.message||'';
            $('pin-unlock-input').value='';
            $('pin-unlock-input').focus();
            return;
          }
          $('pin-unlock-error').textContent=data.message||'غلط پن کوڈ یا پاس ورڈ!';
          $('pin-unlock-input').select();
        }catch(_){
          $('pin-unlock-error').textContent='کنکشن کا مسئلہ! انٹرنیٹ چیک کریں۔';
        }
        return;
      }

      if(val===state.pinCode)finishPinUnlock(true);
      else{$('pin-unlock-error').textContent='غلط پن کوڈ! دوبارہ کوشش کریں۔';$('pin-unlock-input').select();}
    };
  }
  if($('pin-unlock-cancel'))$('pin-unlock-cancel').onclick=()=>finishPinUnlock(false);
  if($('lock-app-now-btn'))$('lock-app-now-btn').onclick=()=>{
    if(isWebMode)requestWebLogin('ایپ لاک کر دی گئی ہے۔ کھولنے کے لیے پن کوڈ درج کریں۔');
    else if(state.pinCode)requestPinUnlock('ایپ لاک کر دی گئی ہے۔ کھولنے کے لیے پن کوڈ درج کریں۔',false);
  };
  if($('logout-btn'))$('logout-btn').onclick=()=>{
    setAuthToken('');
    $('save-state').textContent='لاگ آؤٹ ہو چکا';
    requestWebLogin('آپ لاگ آؤٹ ہو چکے ہیں۔ دوبارہ لاگ ان کریں۔');
  };
  function openPinSettings(){
    const d=$('pin-dialog');if(!d)return;
    const hasPin=isWebMode?true:!!state.pinCode;
    $('pin-current-wrap').hidden=!hasPin;
    $('pin-remove-btn').hidden=isWebMode||!hasPin;
    $('pin-current').value='';
    $('pin-new').value='';
    $('pin-form-msg').textContent='';
    $('pin-status-text').textContent=isWebMode?'لاگ ان پاس ورڈ / پن کوڈ تبدیل کریں۔ کم از کم 4 ہندسے یا حروف لکھیں۔':hasPin?'✓ حفاظتی پن لاک فعال ہے۔ تبدیل کرنے یا ختم کرنے کے لیے موجودہ پن لکھیں۔':'ابھی کوئی پن لاک نہیں لگا۔ نیا 4 سے 8 ہندسوں کا پن کوڈ مقرر کریں۔';
    d.showModal();
    setTimeout(()=>$(hasPin?'pin-current':'pin-new').focus(),20);
  }
  if($('pin-settings-btn'))$('pin-settings-btn').onclick=openPinSettings;
  if($('close-pin-dialog'))$('close-pin-dialog').onclick=()=>$('pin-dialog').close();
  if($('pin-form')){
    $('pin-form').onsubmit=async e=>{
      e.preventDefault();
      const cur=englishDigits($('pin-current').value).trim();
      const next=englishDigits($('pin-new').value).trim();
      if(!next||next.length<4){$('pin-form-msg').textContent='نیا پن کم از کم 4 ہندسوں یا حروف کا ہونا چاہیے۔';return;}

      if(isWebMode){
        $('pin-form-msg').textContent='سرور پر تبدیل ہو رہا ہے...';
        try{
          const res=await fetch('/api/auth/change-pin',{
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':'Bearer '+getAuthToken()
            },
            body:JSON.stringify({currentPassword:cur,newPassword:next})
          });
          const result=await res.json();
          if(res.ok&&result.status==='ok'){
            setAuthToken(result.token);
            state.pinCode=next;
            save();updatePinUI();
            alert('✓ پن کوڈ کامیابی سے تبدیل ہو گیا!');
            $('pin-dialog').close();
            return;
          }
          $('pin-form-msg').textContent=result.message||'پن تبدیل نہیں ہو سکا۔';
        }catch(_){
          $('pin-form-msg').textContent='سرور سے رابطہ نہیں ہو سکا۔ انٹرنیٹ چیک کریں۔';
        }
        return;
      }

      const hasPin=!!state.pinCode;
      if(hasPin&&cur!==state.pinCode){$('pin-form-msg').textContent='موجودہ پن کوڈ درست نہیں ہے۔';return;}
      state.pinCode=next;
      save();updatePinUI();
      $('pin-dialog').close();
    };
  }
  if($('pin-remove-btn')){
    $('pin-remove-btn').onclick=()=>{
      const cur=englishDigits($('pin-current').value).trim();
      if(state.pinCode&&cur!==state.pinCode){$('pin-form-msg').textContent='پن ختم کرنے کے لیے پہلے موجودہ پن کوڈ لکھیں۔';return;}
      state.pinCode='';
      save();updatePinUI();
      $('pin-dialog').close();
    };
  }
  if($('lock-day'))$('lock-day').onclick=async()=>{
    const d=state.date||today();
    if(!Array.isArray(state.lockedDates))state.lockedDates=[];
    if(state.lockedDates.includes(d)){
      if(state.pinCode){
        const ok=await requestPinUnlock(`${fmtDate(d)} کا لاک کھولنے کے لیے اپنا پن کوڈ (PIN) درج کریں`,true);
        if(!ok)return;
      }
      state.lockedDates=state.lockedDates.filter(x=>x!==d);
    }else state.lockedDates.push(d);
    save();applyFilter(true);
  };
  function recordHistory(row,field,from,to){
    if(from===to)return;
    if(!row.history)row.history=[];
    row.history.push({at:new Date().toISOString(),field,from:String(from||''),to:String(to||'')});
    if(row.history.length>30)row.history=row.history.slice(-30);
    save();
  }
  $('close-history').onclick=()=>$('history-dialog').close();
  function openHistory(row){
    const d=$('history-dialog');
    if(!d)return;
    const filtered=selectedRows();
    const pos=filtered.indexOf(row);
    const idx=pos>=0?activeStartSerial()+pos:(Number(state.startSerial)||1)+state.rows.filter(populated).indexOf(row);
    $('history-subtitle').textContent=`انٹری #${idx>0?idx:''} — ${row.sender||'نامعلوم'} (${fmtDate(row.entryDate)})`;
    const tbody=$('history-rows');
    tbody.replaceChildren();
    if(!row.history||!row.history.length){
      const tr=document.createElement('tr');
      tr.innerHTML='<td colspan="4" style="text-align:center;padding:16px;color:var(--muted)">اس انٹری میں ابھی کوئی تبدیلی نہیں ہوئی۔</td>';
      tbody.append(tr);
    }else{
      row.history.slice().reverse().forEach(h=>{
        const tr=document.createElement('tr');
        const timeStr=new Date(h.at).toLocaleString('en-GB');
        const fieldName=fieldUrduLabels[h.field]||h.field;
        tr.innerHTML=`<td>${timeStr}</td><td><strong>${fieldName}</strong></td><td style="color:#8b3a32">${h.from||'—'}</td><td style="color:#216f43;font-weight:600">${h.to||'—'}</td>`;
        tbody.append(tr);
      });
    }
    d.showModal();
  }
  function applyFilter(keepFocus=false,forPrint=false){ensureDraft();const start=activeStartSerial();if($('start-serial')&&document.activeElement!==$('start-serial'))$('start-serial').value=start;let offset=0;const active=keepFocus?document.activeElement?.closest('#rows tr'):null;let draftShown=false;const day=dayMode();
    forPrint=forPrint||registerPrintActive;
    updateLockBtn();
    const nextKey=JSON.stringify([selectedBranch,state.date,$('all-dates').checked,$('search').value,$('date-from').value,$('date-to').value]);
    if(nextKey!==viewKey){viewPage=0;viewKey=nextKey;}
    const filtered=selectedRows(),matchedIds=new Set(filtered.map(r=>r.id)),pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    viewPage=Math.min(viewPage,pages-1);
    const pageIds=new Set((forPrint?filtered:filtered.slice(viewPage*pageSize,(viewPage+1)*pageSize)).map(r=>r.id));
    pageNav.hidden=forPrint||pages===1;pagePrev.disabled=viewPage===0;pageNext.disabled=viewPage===pages-1;
    pageLabel.textContent=`صفحہ ${viewPage+1} / ${pages} · ${filtered.length} اندراجات · مجموعہ اور پرنٹ تمام منتخب اندراجات کا ہے`;
    const currPage=activePageNumber();
    if($('page-no-input')&&document.activeElement!==$('page-no-input'))$('page-no-input').value=currPage;
    if($('page-no-val'))$('page-no-val').textContent=currPage;
    const findDuplicate=duplicateLookup(),visibleNodes=[];
    reviewDuplicates(filtered,findDuplicate);
    state.rows.forEach(r=>{let tr=rowNodes.get(r.id);const hasData=populated(r);let draft=day&&branchMatch(r)&&!hasData&&!draftShown;if(draft)draftShown=true;const matched=matchedIds.has(r.id);
      const serial=matched?start+offset++:null;
      if(!(pageIds.has(r.id)||draft||(tr&&tr===active))){if(tr){tr.remove();rowNodes.delete(r.id);}return;}
      if(!tr)tr=createRowElement(r);
      visibleNodes.push(tr);tr.hidden=false;tr.classList.toggle('draft-row',!hasData);
      tr.classList.toggle('order-type-bank',(r.orderType||'')==='bank');
      tr.classList.toggle('order-type-city',(r.orderType||'')==='city');
      const orderSelect=tr.querySelector('.order-type-select');
      if(orderSelect){orderSelect.value=r.orderType||'';orderSelect.dataset.value=r.orderType||'';}
      const balInput=tr.querySelector('.bal-type-input');
      if(balInput){const bAmt=integerAmount(r.balance);balInput.value=r.balanceType||'';balInput.classList.toggle('visible',bAmt!==null&&bAmt!==0n);balInput.classList.toggle('has-value',!!(r.balanceType&&r.balanceType.trim()));}
      const rLocked=isDayLocked(r.entryDate||state.date);
      if(tr._locked!==rLocked){
        tr.classList.toggle('row-locked',rLocked);
        tr.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=rLocked;});
        const delBtn=tr.querySelector('.delete');if(delBtn)delBtn.disabled=rLocked;
        tr._locked=rLocked;
      }
      const currency=partyCurrency(r.branch).toUpperCase();
      if(tr._currency!==currency){const input=tr.querySelector('[data-field="pkr"]');input.parentElement.dataset.currency=currency;input.setAttribute('aria-label',currency==='AFN'?'افغانی':'روپیہ');tr._currency=currency;}
      const cell=tr.firstElementChild;const val=matched?serial:!populated(r)?'＋':'—';
      const dup=matched&&hasData?findDuplicate(r):null;
      const decoration=JSON.stringify([matched,val,dup?.index,r.history?.length||0,r.entryDate,day]);
      if(tr._decoration===decoration)return;
      tr._decoration=decoration;
      cell.replaceChildren();
      const wrap=document.createElement('div');wrap.className='serial-cell';
      if(matched && populated(r)){
        if(dup){
          const badge=document.createElement('span');badge.className='dup-badge no-print';badge.textContent='⚠️';
          badge.title=`اسی تاریخ اور پارٹی میں ممکنہ دہرائی گئی انٹری #${dup.index}`;
          wrap.append(badge);
        }
      }
      const numSpan=document.createElement('span');numSpan.className='serial-num';numSpan.textContent=String(val);
      wrap.append(numSpan);
      if(matched && r.history && r.history.length>0){
        const hBtn=document.createElement('button');hBtn.type='button';hBtn.className='history-btn no-print';
        hBtn.textContent='🕒';hBtn.title=`اس انٹری کی ${r.history.length} تبدیلیاں دیکھیں۔`;
        hBtn.onclick=e=>{e.stopPropagation();openHistory(r);};
        wrap.append(hBtn);
      }
      cell.append(wrap);
      cell.title=matched?`نمبر شمار: ${val} (تبدیل کرنے کے لیے کلک کریں)`:(r.entryDate?fmtDate(r.entryDate):'');
      if(matched&&!day){const small=document.createElement('small');small.className='row-date';small.textContent=fmtDate(r.entryDate);cell.append(small);}
      const rCell=tr.querySelector('.col-receipt');
      if(rCell){
        rCell.replaceChildren();
        if(matched && populated(r)){
          const receipt=document.createElement('button');receipt.type='button';receipt.className='receipt-btn no-print';receipt.textContent='🖨 رسید';receipt.title='اس انٹری کی رسید پرنٹ کریں';receipt.setAttribute('aria-label','انٹری '+val+' کی رسید');
          receipt.onclick=e=>{e.stopPropagation();openReceipt(r,val);};
          rCell.append(receipt);
        }
      }
    });
    // Retain focused controls and their selection; mount only the current view.
    let cursor=$('rows').firstElementChild;
    for(const node of visibleNodes){if(node===cursor)cursor=cursor.nextElementSibling;else $('rows').insertBefore(node,cursor);}
    const isParty=selectedBranch.startsWith('b:');
    const paper=document.querySelector('.paper');
    if(paper)paper.classList.toggle('party-page',isParty);
    const branch=selectedBranch===''?'تمام پارٹیاں':selectedBranch==='__unassigned'?'بغیر پارٹی':selectedBranch.slice(2);
    $('branch-heading').textContent=(isParty?'🏢 ':'')+branch+($('search').value.trim()?' | تلاش: '+$('search').value.trim():'');
    $('view-note').textContent=day?'':'دکھایا جا رہا ہے: '+viewLabel();
    if($('date-screen-badge'))$('date-screen-badge').textContent=fmtDate(state.date||today());
    const hasRange=rangeActive();
    if($('toggle-range'))$('toggle-range').classList.toggle('active',hasRange||!($('range-drawer')?.hidden??true));
    totals(filtered);
    const curr=activeCurrency();
    const isAfn=curr==='afn';
    const hasAnyAfn=filtered.some(r=>partyCurrency(r.branch)==='afn');
    const mixed=new Set(filtered.map(r=>partyCurrency(r.branch))).size>1;
    paper?.classList.toggle('mixed-currencies',mixed);
    const currLabel=isAfn?'افغانی':(selectedBranch===''&&hasAnyAfn?'روپیہ / افغانی':'روپیہ');
    if($('th-currency'))$('th-currency').textContent=currLabel;
    if($('total-pkr'))$('total-pkr').title=isAfn?'کل افغانی':'کل روپیہ';
    updatePartyTabsActive();
  }
  function updateBackup(){const at=state.lastBackupAt;const overdue=!at||Date.now()-Date.parse(at)>7*86400000;$('backup-banner').classList.toggle('backup-due',overdue);$('backup-status').textContent=at?`آخری بیک اَپ ڈاؤن لوڈ: ${new Date(at).toLocaleString('en-GB')}${overdue?' — نیا بیک اَپ لے لیں۔':''}`:'ابھی بیک اَپ نہیں لیا گیا۔ اپنی انٹریوں کا بیک اَپ محفوظ کریں۔';}
  function updateUndo(){$('undo-bar').hidden=!state.trash.length;$('undo-message').textContent=`${state.trash.length} حذف شدہ انٹریاں واپس لائی جا سکتی ہیں۔ آخری حذف پہلے واپس ہوگا۔`;}
  const placeSuggestMenu=document.createElement('div');
  placeSuggestMenu.className='place-suggest-menu no-print';
  placeSuggestMenu.hidden=true;
  document.body.append(placeSuggestMenu);
  let activePlaceInput=null,placeSuggestItems=[],placeSuggestIndex=0;
  function getFieldSuggestions(field,query,row){
    const q=nameKey(query);
    if(!q)return [];
    const ctxSender=field==='receiver'&&row?.sender?nameKey(row.sender):'';
    const ctxReceiver=field==='place'&&row?.receiver?nameKey(row.receiver):'';
    const map=new Map();
    for(let i=state.rows.length-1;i>=0;i--){
      const r=state.rows[i];
      if(r.id===row?.id||!populated(r))continue;
      const p=cleanName(r[field]);
      if(!p)continue;
      const k=nameKey(p);
      const sameCtx=(ctxSender&&nameKey(r.sender)===ctxSender)||(ctxReceiver&&nameKey(r.receiver)===ctxReceiver);
      if(!map.has(k))map.set(k,{text:p,key:k,count:1,last:i,sameCtx:!!sameCtx});
      else{
        const entry=map.get(k);
        entry.count++;
        if(sameCtx)entry.sameCtx=true;
      }
    }
    const matches=[...map.values()].filter(m=>m.key.includes(q)&&m.key!==q);
    matches.sort((a,b)=>{
      const aStarts=a.key.startsWith(q)?1:0,bStarts=b.key.startsWith(q)?1:0;
      if(aStarts!==bStarts)return bStarts-aStarts;
      if(a.sameCtx!==b.sameCtx)return (b.sameCtx?1:0)-(a.sameCtx?1:0);
      if(b.count!==a.count)return b.count-a.count;
      return b.last-a.last;
    });
    return matches.slice(0,6).map(m=>m.text);
  }
  function hidePlaceSuggestions(){
    placeSuggestMenu.hidden=true;
    placeSuggestMenu.replaceChildren();
    placeSuggestItems=[];
    placeSuggestIndex=0;
    activePlaceInput=null;
  }
  function updateActivePlaceItem(){
    Array.from(placeSuggestMenu.children).forEach((el,idx)=>el.classList.toggle('active',idx===placeSuggestIndex));
  }
  function showFieldSuggestions(field,input,row,acceptFn,onPicked){
    const items=getFieldSuggestions(field,input.value,row);
    if(!items.length){hidePlaceSuggestions();return;}
    activePlaceInput=input;
    placeSuggestItems=items;
    placeSuggestIndex=0;
    placeSuggestMenu.replaceChildren();
    items.forEach((text,idx)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='place-suggest-item'+(idx===0?' active':'');
      btn.textContent=text;
      btn.onmousedown=e=>{
        e.preventDefault();
        input.value=text;
        hidePlaceSuggestions();
        acceptFn();
        if(onPicked)onPicked();
      };
      placeSuggestMenu.append(btn);
    });
    const rect=input.getBoundingClientRect();
    placeSuggestMenu.style.top=(rect.bottom+2)+'px';
    placeSuggestMenu.style.left=rect.left+'px';
    placeSuggestMenu.style.minWidth=Math.max(120,rect.width)+'px';
    placeSuggestMenu.hidden=false;
  }
  window.addEventListener('scroll',()=>{if(!placeSuggestMenu.hidden)hidePlaceSuggestions();},true);
  window.addEventListener('resize',()=>{if(!placeSuggestMenu.hidden)hidePlaceSuggestions();});
  function autoFillFromSender(row,tr){
    if(!row.sender.trim()||row.mobile.trim())return;
    const sKey=nameKey(row.sender);
    const prev=[...state.rows].reverse().find(r=>r.id!==row.id&&populated(r)&&nameKey(r.sender)===sKey&&r.mobile.trim());
    if(prev){
      row.mobile=prev.mobile;
      const mobEl=tr.querySelector('[data-field="mobile"]');
      if(mobEl)mobEl.value=prev.mobile;
      save();
    }
  }
  function createRowElement(row){
    const tr=document.createElement('tr');tr.dataset.id=row.id;rowNodes.set(row.id,tr);
    const num=document.createElement('td');num.className='number';
    num.onclick=()=>{
      if(!populated(row))return;
      const current=parseInt(englishDigits(num.querySelector('.serial-num')?.textContent||num.textContent),10)||activeStartSerial();
      const next=prompt('اس قطار کا نیا نمبر شمار لکھیں (یہیں سے آگے خودکار نمبر بنیں گے):',current);
      if(next===null)return;
      const val=parseInt(englishDigits(next.trim()),10);
      if(!isNaN(val)&&val>0){
        const visible=state.rows.filter(matches);
        const idx=visible.indexOf(row);
        const newStart=Math.max(1,val-(idx>=0?idx:0));
        setActiveStartSerial(newStart);
        if($('start-serial'))$('start-serial').value=newStart;
        save();applyFilter(true);
      }
    };
    tr.append(num);
    const rLocked=isDayLocked(row.entryDate||state.date);
    if(rLocked)tr.classList.add('row-locked');
    fields.forEach((field,i)=>{
      const td=document.createElement('td');if(field==='branch')td.className='col-branch no-print';if(field==='place')td.className='col-place';if(field==='pkr')td.className='col-pkr';if(field==='balance')td.className='col-balance';
      const isText=['sender','receiver','place'].includes(field);
      const input=document.createElement(field==='branch'?'select':(isText?'textarea':'input'));input.dataset.field=field;input.setAttribute('aria-label',labels[i]);input.autocomplete='off';input.maxLength=moneyFields.includes(field)?20:300;
      let updateBalTypeVis=null,balTypeInput=null;
      if(field==='balance'){
        balTypeInput=document.createElement('input');
        balTypeInput.dataset.field='balanceType';
        balTypeInput.className='bal-type-input no-print';
        balTypeInput.setAttribute('aria-label','بقایا کی نوعیت یا نام');
        balTypeInput.setAttribute('list','bal-type-suggestions');
        balTypeInput.placeholder='＋ نام / نوعیت';
        balTypeInput.value=row.balanceType||'';
        balTypeInput.autocomplete='off';
        balTypeInput.maxLength=100;
        balTypeInput.disabled=rLocked;
        updateBalTypeVis=()=>{
          const amt=integerAmount(input.value);
          const hasAmt=amt!==null&&amt!==0n;
          balTypeInput.classList.toggle('visible',hasAmt);
          balTypeInput.classList.toggle('has-value',!!(balTypeInput.value.trim()));
        };
        balTypeInput.addEventListener('focus',()=>{
          updateBalTypeSuggestions();
          balTypeInput._prevVal=balTypeInput.value;
        });
        function acceptBalType(){
          const val=formatAllah(balTypeInput.value).trim();
          balTypeInput.value=val;
          if(balTypeInput._prevVal!==val){
            recordHistory(row,'balanceType',balTypeInput._prevVal||'',val);
            balTypeInput._prevVal=val;
          }
          if(row.balanceType!==val){
            row.balanceType=val;
            updateBalTypeVis();
            save();
            totals();
          }
        }
        balTypeInput.addEventListener('change',acceptBalType);
        balTypeInput.addEventListener('blur',acceptBalType);
        balTypeInput.addEventListener('keydown',e=>{
          if(e.key==='Enter'){e.preventDefault();acceptBalType();balTypeInput.blur();}
        });
        updateBalTypeVis();
      }
      const afterSuggestionPick=()=>{if(field==='sender')autoFillFromSender(row,tr);};
      if(isText){
        input.addEventListener('keydown',e=>{
          if(placeSuggestMenu.hidden||activePlaceInput!==input||!placeSuggestItems.length)return;
          if(e.key==='ArrowDown'){e.preventDefault();placeSuggestIndex=(placeSuggestIndex+1)%placeSuggestItems.length;updateActivePlaceItem();}
          else if(e.key==='ArrowUp'){e.preventDefault();placeSuggestIndex=(placeSuggestIndex-1+placeSuggestItems.length)%placeSuggestItems.length;updateActivePlaceItem();}
          else if(e.key==='Escape'){e.preventDefault();input._dismissedFor=input.value;hidePlaceSuggestions();}
          else if(e.key==='Enter'&&!e.shiftKey){
            e.preventDefault();e.stopImmediatePropagation();
            const picked=placeSuggestItems[placeSuggestIndex]||placeSuggestItems[0];
            if(picked){input.value=picked;hidePlaceSuggestions();accept();afterSuggestionPick();}
          }else if(e.key==='Tab'&&!e.shiftKey){
            const picked=placeSuggestItems[placeSuggestIndex]||placeSuggestItems[0];
            if(picked&&(placeSuggestIndex>0||nameKey(picked).startsWith(nameKey(input.value)))){
              input.value=picked;hidePlaceSuggestions();accept();afterSuggestionPick();
            }else hidePlaceSuggestions();
          }
        });
      }
      if(isText){input.rows=1;input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();input.blur();}});}
      if(field==='branch')branchOptions(input,row.branch);else input.value=moneyFields.includes(field)?wholeText(row[field]):row[field];
      function adjustHeight(el){if(typeof CSS!=='undefined'&&CSS.supports&&CSS.supports('field-sizing','content'))return;el.style.height='auto';el.style.height=el.scrollHeight+'px';}
      if(isText)adjustHeight(input);
      if(moneyFields.includes(field)){input.className='amount';input.inputMode='numeric';input.placeholder='0';if(field==='pkr')input.setAttribute('aria-label',partyCurrency(row.branch)==='afn'?'افغانی':'روپیہ');input.setCustomValidity(integerAmount(row[field])===null?'رقم درست کریں':'');}
      if(field==='mobile'){input.className='phone';input.inputMode='tel';}
      if(field==='place'){input.className='place-input';}
      if(rLocked)input.disabled=true;
      input.addEventListener('focus',()=>{input._prevVal=input.value;});
      input.addEventListener('blur',()=>{
        if(isText)hidePlaceSuggestions();
        if(input._prevVal!==undefined&&input._prevVal!==input.value){recordHistory(row,field,input._prevVal,input.value);input._prevVal=input.value;}
        if(field==='sender')autoFillFromSender(row,tr);
      });
      function accept(event){
        if(event?.isComposing)return;
        if(field==='branch'&&input.value==='__new_party__'){input.value=row.branch;openBranches(row);return;}
        const wasPopulated=populated(row);
        if(moneyFields.includes(field)||field==='mobile'){const value=englishDigits(input.value);if(value!==input.value){const start=input.selectionStart,end=input.selectionEnd;input.value=value;if(start!==null)input.setSelectionRange(start,end);}}
        if(isText){const value=formatAllah(input.value);if(value!==input.value){const pos=input.selectionStart,diff=value.length-input.value.length;input.value=value;if(pos!==null){const nextPos=Math.max(0,pos+diff);input.setSelectionRange(nextPos,nextPos);}}}
        row[field]=input.value;
        if(isText)adjustHeight(input);
        if(!row.entryDate)row.entryDate=state.date||today();
        if(selectedBranch.startsWith('b:')&&!row.branch)row.branch=selectedBranch.slice(2);
        if(moneyFields.includes(field))input.setCustomValidity(integerAmount(input.value)===null?'صرف مکمل عدد لکھیں، اعشاری رقم نہیں':'');
        if(!wasPopulated&&matches(row))viewPage=Math.floor(selectedRows().findIndex(r=>r.id===row.id)/pageSize);
        if(updateBalTypeVis)updateBalTypeVis();
        applyFilter(true);save();
        if(isText){
          if(input._dismissedFor!==input.value){input._dismissedFor=null;showFieldSuggestions(field,input,row,accept,afterSuggestionPick);}
        }
      }
      if(moneyFields.includes(field)){
        input.addEventListener('blur',()=>{const value=wholeText(input.value);if(value!==input.value){input.value=value;row[field]=value;save();}});
        input.addEventListener('keydown',e=>{if(e.key==='Enter')input.blur();});
      }
      input.addEventListener(field==='branch'?'change':'input',accept);input.addEventListener('compositionend',()=>accept());
      if(field==='branch'){input.addEventListener('change',()=>{if(input._prevVal!==undefined&&input._prevVal!==input.value){recordHistory(row,'branch',input._prevVal,input.value);input._prevVal=input.value;}});}
      input.addEventListener('keydown',e=>{
        if((e.ctrlKey||e.metaKey)&&(e.key==='d'||e.key==='D')&&!e.shiftKey&&!e.altKey){
          e.preventDefault();
          const visible=state.rows.filter(r=>matches(r)||(!populated(r)&&rowNodes.has(r.id)));
          const curIdx=visible.indexOf(row);
          const prevRow=curIdx>0?visible[curIdx-1]:null;
          if(prevRow&&prevRow[field]){
            hidePlaceSuggestions();
            input.value=moneyFields.includes(field)?wholeText(prevRow[field]):prevRow[field];
            if(field==='balance'){
              row.balanceType=prevRow.balanceType||'';
              const s=td.querySelector('.bal-type-input');
              if(s){s.value=row.balanceType;if(updateBalTypeVis)updateBalTypeVis();}
            }
            accept();
            if(field==='sender')autoFillFromSender(row,tr);
          }
          return;
        }
        if(e.key==='Tab'&&!e.shiftKey&&i===fields.length-1){
          e.preventDefault();
          const visible=state.rows.filter(r=>matches(r)||(!populated(r)&&rowNodes.has(r.id)));
          const next=visible[visible.indexOf(row)+1];
          if(!next){add();}else{if(!rowNodes.has(next.id)){viewPage=Math.floor(selectedRows().indexOf(next)/pageSize);applyFilter();}focusRow(next);}
        }
      });
      td.append(input);
      if(balTypeInput)td.append(balTypeInput);
      tr.append(td);
      if(field==='place'){
        const tdType=document.createElement('td');tdType.className='col-order-type no-print';
        const type=document.createElement('select');type.dataset.field='orderType';type.className='order-type-select no-print';type.setAttribute('aria-label','آرڈر کی قسم');type.append(makeOption('','قسم منتخب کریں'),makeOption('bank','بینک / والٹ'),makeOption('city','شہر'));type.value=row.orderType||'';type.dataset.value=row.orderType||'';type.disabled=rLocked;
        type.onchange=()=>{
          recordHistory(row,'orderType',row.orderType,type.value);
          row.orderType=type.value;
          type.dataset.value=type.value;
          state.rows=groupRows(state.rows);
          save();
          applyFilter(true);
        };
        type.addEventListener('keydown',e=>{
          if((e.ctrlKey||e.metaKey)&&(e.key==='d'||e.key==='D')&&!e.shiftKey&&!e.altKey){
            e.preventDefault();
            const visible=state.rows.filter(r=>matches(r)||(!populated(r)&&rowNodes.has(r.id)));
            const curIdx=visible.indexOf(row);
            const prevRow=curIdx>0?visible[curIdx-1]:null;
            if(prevRow&&prevRow.orderType!==undefined){
              type.value=prevRow.orderType;
              type.onchange();
            }
          }
        });
        tdType.append(type);tr.append(tdType);
      }
    });
    tr.addEventListener('focusout',()=>setTimeout(()=>{if(!tr.contains(document.activeElement))applyFilter(true);},0));
    const tdReceipt=document.createElement('td');tdReceipt.className='col-receipt no-print';tr.append(tdReceipt);
    const td=document.createElement('td');td.className='no-print';const del=document.createElement('button');del.className='delete';del.textContent='×';del.title='حذف کریں — Undo سے واپس لائیں';del.setAttribute('aria-label','انٹری حذف کریں');
    if(rLocked)del.disabled=true;
    del.onclick=()=>{const index=state.rows.findIndex(r=>r.id===row.id);if(index<0)return;if(populated(row)){state.trash.push({row:structuredClone(row),index});state.trash=state.trash.slice(-20);}state.rows.splice(index,1);render();save();};td.append(del);tr.append(td);
    return tr;
  }
  function appendRow(row){$('rows').append(createRowElement(row));}
  function prependRow(row){$('rows').prepend(createRowElement(row));}
  function applyFont(){document.documentElement.style.setProperty('--entry-font',state.fontSize+'px');$('font-size').textContent=state.fontSize;$('font-smaller').disabled=state.fontSize<=10;$('font-larger').disabled=state.fontSize>=22;}
  function render(){ensureActiveParty();state.rows=groupRows(state.rows);rowNodes.clear();$('rows').replaceChildren();$('title').value=state.title;if($('title-print'))$('title-print').textContent=state.title||'اندراج رجسٹر';$('date').value=state.date;if($('start-serial'))$('start-serial').value=activeStartSerial();const currPage=activePageNumber();if($('page-no-input'))$('page-no-input').value=currPage;if($('page-no-val'))$('page-no-val').textContent=currPage;applyFont();updateBranches();applyFilter();updateUndo();updateBackup();journalController?.reset();}
  function focusRow(row){
    const tr=rowNodes.get(row.id);
    const el=tr?.querySelector('[data-field="sender"]');
    if(el){
      el.focus({preventScroll:true});
      tr.scrollIntoView({block:'center',behavior:'smooth'});
    }
  }
  function add(){
    if(journalController?.isActive()){journalController.add();return;}
    if(isDayLocked(state.date)){alert('یہ تاریخ لاک ہے؛ نئی انٹری کے لیے پہلے اوپر تاریخ کے ساتھ "دن لاک ہے" پر کلک کر کے ان لاک کریں۔');return;}
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
  $('undo').onclick=()=>{const item=state.trash.pop();if(!item)return;if(item.row.branch&&!state.branches.includes(item.row.branch))state.branches.push(item.row.branch);state.rows.splice(Math.min(item.index,state.rows.length),0,item.row);render();save();if(!rowNodes.has(item.row.id)||rowNodes.get(item.row.id).hidden)$('filter-message').textContent='انٹری واپس آ گئی ہے۔ اسے دیکھنے کے لیے فلٹر صاف کریں۔';};
  const DISK_DB_NAME='hisaab-disk-db-v1',DISK_STORE='handles',DISK_KEY='primary';
  function openHandleDB(){
    return new Promise((resolve,reject)=>{
      if(typeof indexedDB==='undefined')return reject(Error('No IndexedDB'));
      const req=indexedDB.open(DISK_DB_NAME,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(DISK_STORE))req.result.createObjectStore(DISK_STORE);};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  async function saveDiskHandle(handle){
    let db;
    try{
      db=await openHandleDB();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(DISK_STORE,'readwrite');
        tx.objectStore(DISK_STORE).put(handle,DISK_KEY);
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
    }catch(_){}finally{db?.close();}
  }
  async function loadDiskHandle(){
    let db;
    try{
      db=await openHandleDB();
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction(DISK_STORE,'readonly');
        const req=tx.objectStore(DISK_STORE).get(DISK_KEY);
        req.onsuccess=()=>resolve(req.result||null);
        req.onerror=()=>reject(req.error);
      });
    }catch(_){return null;}finally{db?.close();}
  }
  function updateDiskFileStatus(){
    const help=$('storage-help');
    if(!nativeStorage&&autoBackupHandle){
      if($('auto-backup-status'))$('auto-backup-status').textContent=`پی سی فائل فعال: ${autoBackupHandle.name} ✓`;
      if(help)help.textContent=`ڈیٹا براہِ راست آپ کے کمپیوٹر کی فائل (${autoBackupHandle.name}) میں محفوظ ہو رہا ہے؛ براؤزر ہسٹری صاف ہونے سے ڈیٹا ضائع نہیں ہوگا۔`;
    }
  }
  async function flushDiskFileNow(){
    if(!autoBackupHandle)return false;
    if(diskWriteBusy){diskWritePending=true;return true;}
    diskWriteBusy=true;
    unsavedDisk=true;
    try{
      do{
        diskWritePending=false;
        const clean={...state,rows:state.rows.filter(populated)};
        const writable=await autoBackupHandle.createWritable();
        await writable.write(JSON.stringify(clean,null,2));
        await writable.close();
      }while(diskWritePending);
      unsavedDisk=false;
      updateDiskFileStatus();
      savedStatus();
      return true;
    }catch(_){
      unsavedDisk=false;
      if(!nativeStorage){
        pendingDiskHandle=autoBackupHandle;
        reconnectDiskBtn.textContent=`🔗 پی سی فائل دوبارہ جوڑیں (${autoBackupHandle.name})`;
        reconnectDiskBtn.hidden=false;
        $('save-state').textContent='پی سی فائل میں محفوظ نہیں ہو سکا — دوبارہ جوڑیں';
      }
      return false;
    }finally{
      diskWriteBusy=false;
    }
  }
  function scheduleDiskSync(){
    if(!autoBackupHandle)return;
    unsavedDisk=true;
    clearTimeout(diskSyncTimer);
    diskSyncTimer=setTimeout(()=>{diskSyncTimer=null;flushDiskFileNow();},120);
  }
  async function executeAutoBackup(isSafety=false){
    const clean={...state,rows:state.rows.filter(populated)};
    await window.HisaabExternalBackup?.save(clean);
    if(autoBackupHandle&&!isSafety){
      await flushDiskFileNow();
    }
    if(window.electronAPI?.saveAutoBackup){
      try{
        const res=await window.electronAPI.saveAutoBackup(clean,isSafety);
        if(res?.status==='saved'){
          const time=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
          if($('auto-backup-status'))$('auto-backup-status').textContent=`خودکار محفوظ: ${time} ✓`;
          return res;
        }
      }catch(_){}
    }else{
      try{
        const key='hisaab-auto-backups-v1';
        const list=JSON.parse(localStorage.getItem(key)||'[]');
        list.unshift({time:new Date().toISOString(),isSafety,data:clean});
        localStorage.setItem(key,JSON.stringify(list.slice(0,30)));
        const time=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
        if($('auto-backup-status'))$('auto-backup-status').textContent=autoBackupHandle?`پی سی فائل فعال: ${autoBackupHandle.name} (${time}) ✓`:`خودکار محفوظ: ${time} ✓`;
      }catch(_){}
    }
  }
  function scheduleAutoBackup(immediate=false){
    clearTimeout(autoBackupTimer);
    autoBackupTimer=setTimeout(()=>executeAutoBackup(false),immediate?100:2500);
  }
  async function makeSafetyBackup(){
    const backup=await executeAutoBackup(true);
    try{
      const snapshot=storageBlocked?localStorage.getItem(KEY):JSON.stringify({...state,rows:state.rows.filter(populated)});
      localStorage.setItem('hisaab-safety-pre-restore',snapshot);
      return true;
    }catch(_){return !storageBlocked&&backup?.status==='saved';}
  }
  window.HisaabExternalBackup.init(()=>{if(storageReadFailed)throw Error('اصل ڈیٹا نہیں کھل سکا؛ پہلے ڈیٹا بحال کریں');return {...state,rows:state.rows.filter(populated)};});
  let restoreBusy=false;
  async function restoreBackupData(rawObj){
    if(restoreBusy)return false;
    const data=migrate(rawObj);
    const entries=data.rows.filter(populated),journal=data.journal.rows.filter(r=>r.detail.trim()||r.debit.trim()||r.credit.trim());
    const dates=[...entries.map(r=>r.entryDate),...journal.map(r=>r.date)].sort();
    const preview=['بیک اَپ بحال کرنے سے پہلے جائزہ',
      'عنوان: '+data.title,
      'آخری بیک اَپ ڈاؤن لوڈ: '+(data.lastBackupAt?new Date(data.lastBackupAt).toLocaleString('en-GB'):'درج نہیں'),
      'تاریخیں: '+(dates.length?dates[0]+' — '+dates.at(-1):'کوئی اندراج نہیں'),
      'پارٹیاں: '+data.branches.length+' | رجسٹر: '+entries.length+' | روزنامچہ: '+journal.length,
      'کیش گنتی والے دن: '+Object.keys(data.journal.cashCounts||{}).length,
      'موجودہ: رجسٹر '+state.rows.filter(populated).length+' | روزنامچہ '+state.journal.rows.filter(r=>r.detail.trim()||r.debit.trim()||r.credit.trim()).length,
      'موجودہ ڈیٹا بدل جائے گا۔ پہلے سیفٹی بیک اَپ محفوظ ہوگا۔ جاری رکھیں؟'].join('\n');
    if(!confirm(preview))return false;
    restoreBusy=true;
    const wasInert=document.body.inert;
    document.body.inert=true;
    try{
      if(!nativeStorage&&!await makeSafetyBackup()){
        alert('سیفٹی بیک اَپ محفوظ نہیں ہو سکا۔ بحالی روک دی گئی؛ موجودہ ڈیٹا تبدیل نہیں ہوا۔');
        return false;
      }
      try{writeState({...data,rows:data.rows.filter(populated)},true);}
      catch{
        alert('بیک اَپ بحال نہیں ہو سکا کیونکہ ڈیٹا محفوظ نہیں ہو رہا۔ موجودہ ڈیٹا تبدیل نہیں ہوا۔');
        return false;
      }
      state=data;storageBlocked=false;storageReadFailed=false;selectedBranch='';
      for(const id of ['search','date-from','date-to'])$(id).value='';
      render();savedStatus();scheduleDiskSync();scheduleAutoBackup();
      return true;
    }finally{document.body.inert=wasInert;restoreBusy=false;}
  }
  async function renderBackupList(){
    const tbody=$('backup-list-rows');
    if(!tbody)return;
    tbody.replaceChildren();
    let items=[];
    if(window.electronAPI?.getAutoBackups){
      try{
        const res=await window.electronAPI.getAutoBackups();
        if(res?.status==='ok'&&Array.isArray(res.backups)){
          items=res.backups.map(b=>({
            label:new Date(b.mtime).toLocaleString('en-GB')+' ('+b.name+')',
            isSafety:!!b.isSafety,
            sizeKB:Math.max(1,Math.round((b.size||0)/1024))+' KB',
            load:async()=>{const r=await window.electronAPI.readAutoBackup(b.name);return JSON.parse(r.content);}
          }));
        }
      }catch(_){}
    }else{
      try{
        const list=JSON.parse(localStorage.getItem('hisaab-auto-backups-v1')||'[]');
        items=list.map(b=>{
          const raw=JSON.stringify(b.data||{});
          return {
            label:new Date(b.time).toLocaleString('en-GB'),
            isSafety:!!b.isSafety,
            sizeKB:Math.max(1,Math.round(raw.length/1024))+' KB',
            load:async()=>b.data
          };
        });
      }catch(_){}
    }
    if(!items.length){
      const tr=document.createElement('tr');
      const td=document.createElement('td');
      td.colSpan=4;td.style.textAlign='center';td.textContent='ابھی کوئی خودکار بیک اَپ موجود نہیں ہے۔';
      tr.append(td);tbody.append(tr);
      return;
    }
    for(const item of items){
      const tr=document.createElement('tr');
      const tdTime=document.createElement('td');tdTime.textContent=item.label;
      const tdType=document.createElement('td');
      const badge=document.createElement('span');
      badge.className=item.isSafety?'badge-safety':'badge-auto';
      badge.textContent=item.isSafety?'سیفٹی بیک اَپ':'خودکار بیک اَپ';
      tdType.append(badge);
      const tdSize=document.createElement('td');tdSize.style.direction='ltr';tdSize.textContent=item.sizeKB;
      const tdAct=document.createElement('td');
      const btn=document.createElement('button');btn.type='button';btn.className='btn-sm';btn.textContent='بحال کریں';
      btn.onclick=async()=>{
        try{
          const rawObj=await item.load();
          if(await restoreBackupData(rawObj))$('backup-dialog').close();
        }catch{alert('یہ بیک اَپ فائل نہیں کھل سکی۔');}
      };
      tdAct.append(btn);
      tr.append(tdTime,tdType,tdSize,tdAct);
      tbody.append(tr);
    }
  }
  async function openBackupManager(){
    if($('open-backup-folder-btn'))$('open-backup-folder-btn').hidden=!window.electronAPI?.openBackupsFolder;
    await renderBackupList();
    $('backup-dialog')?.showModal();
  }
  if($('manage-backups'))$('manage-backups').onclick=()=>openBackupManager();
  if($('close-backups'))$('close-backups').onclick=()=>$('backup-dialog').close();
  if($('open-backup-folder-btn'))$('open-backup-folder-btn').onclick=()=>window.electronAPI?.openBackupsFolder?.();
  if($('create-backup-now-btn'))$('create-backup-now-btn').onclick=async()=>{await executeAutoBackup(false);await renderBackupList();};
  async function setupAutoBackup(){
    if(!window.showSaveFilePicker)return;
    try{
      const handle=await window.showSaveFilePicker({
        suggestedName:`hisaab-database.json`,
        types:[{description:'Hisaab Database File (.json)',accept:{'application/json':['.json']}}]
      });
      autoBackupHandle=handle;
      pendingDiskHandle=null;
      reconnectDiskBtn.hidden=true;
      await saveDiskHandle(handle);
      await flushDiskFileNow();
      scheduleAutoBackup(true);
    }catch(e){/* cancelled by user */}
  }
  async function linkExistingDiskFile(){
    if(!window.showOpenFilePicker)return;
    try{
      const [handle]=await window.showOpenFilePicker({
        multiple:false,
        types:[{description:'Hisaab Database File (.json)',accept:{'application/json':['.json']}}]
      });
      if(!handle)return;
      if(handle.requestPermission){
        const perm=await handle.requestPermission({mode:'readwrite'});
        if(perm!=='granted')return;
      }
      const file=await handle.getFile();
      if(file.size>15000000)throw Error('Large file');
      const text=await file.text();
      if(text.trim()){
        const hasCurrentData=state.rows.some(populated)||state.journal?.rows?.some(r=>r.detail?.trim()||r.debit?.trim()||r.credit?.trim());
        const parsed=migrate(JSON.parse(text));
        if(hasCurrentData&&!confirm(`پی سی فائل "${handle.name}" سے ڈیٹا لوڈ کر کے موجودہ اسکرین سے بدل دیا جائے اور آگے کی تمام انٹریاں اسی فائل میں محفوظ کی جائیں؟`))return;
        state=parsed;
        storageBlocked=false;storageReadFailed=false;selectedBranch='';
        for(const id of ['search','date-from','date-to'])$(id).value='';
      }
      autoBackupHandle=handle;
      pendingDiskHandle=null;
      reconnectDiskBtn.hidden=true;
      await saveDiskHandle(handle);
      persist();
      render();
      await flushDiskFileNow();
      scheduleAutoBackup(true);
    }catch{
      alert('یہ درست حساب ڈیٹا فائل نہیں ہے یا کھل نہیں سکی۔');
    }
  }
  reconnectDiskBtn.onclick=async()=>{
    const handle=pendingDiskHandle||autoBackupHandle;
    if(!handle)return;
    try{
      const perm=handle.requestPermission?await handle.requestPermission({mode:'readwrite'}):'granted';
      if(perm!=='granted')return;
      autoBackupHandle=handle;
      pendingDiskHandle=null;
      reconnectDiskBtn.hidden=true;
      const file=await handle.getFile();
      const hasLocalData=state.rows.some(populated)||state.journal?.rows?.some(r=>r.detail?.trim()||r.debit?.trim()||r.credit?.trim());
      if(!hasLocalData&&file.size>0&&file.size<=15000000){
        state=migrate(JSON.parse(await file.text()));
        persist();
        render();
      }else{
        await flushDiskFileNow();
      }
      updateDiskFileStatus();
      savedStatus();
    }catch(_){}
  };
  async function initDiskPersistence(){
    if(nativeStorage)return;
    try{navigator.storage?.persist?.().catch(()=>{});}catch(_){}
    const handle=await loadDiskHandle();
    if(!handle)return;
    try{
      const perm=handle.queryPermission?await handle.queryPermission({mode:'readwrite'}):'granted';
      if(perm==='granted'){
        autoBackupHandle=handle;
        reconnectDiskBtn.hidden=true;
        const file=await handle.getFile();
        const hasLocalData=state.rows.some(populated)||state.journal?.rows?.some(r=>r.detail?.trim()||r.debit?.trim()||r.credit?.trim());
        if(!hasLocalData&&file.size>0&&file.size<=15000000){
          state=migrate(JSON.parse(await file.text()));
          persist();
          render();
        }else{
          await flushDiskFileNow();
        }
        updateDiskFileStatus();
        savedStatus();
      }else{
        pendingDiskHandle=handle;
        reconnectDiskBtn.textContent=`🔗 پی سی فائل جوڑیں (${handle.name})`;
        reconnectDiskBtn.hidden=false;
        $('save-state').textContent='پی سی فائل دوبارہ جوڑیں';
      }
    }catch(_){}
  }
  if(window.showSaveFilePicker){
    $('auto-backup').hidden=false;
    $('auto-backup').onclick=setupAutoBackup;
    if(!nativeStorage&&$('dialog-setup-disk-btn')){$('dialog-setup-disk-btn').hidden=false;$('dialog-setup-disk-btn').onclick=setupAutoBackup;}
  }
  if(!nativeStorage&&window.showOpenFilePicker){
    if($('link-disk-file')){$('link-disk-file').hidden=false;$('link-disk-file').onclick=linkExistingDiskFile;}
    if($('dialog-link-disk-btn')){$('dialog-link-disk-btn').hidden=false;$('dialog-link-disk-btn').onclick=linkExistingDiskFile;}
  }
  if($('start-serial')){
    $('start-serial').addEventListener('input',()=>{
      const clean=englishDigits($('start-serial').value);
      if(clean!==$('start-serial').value)$('start-serial').value=clean;
      const val=parseInt(clean,10);
      setActiveStartSerial((!isNaN(val)&&val>0)?val:1);
      save();applyFilter(true);
    });
    $('start-serial').addEventListener('blur',()=>{
      $('start-serial').value=activeStartSerial();
    });
  }
  if($('page-no-input')){
    $('page-no-input').addEventListener('input',()=>{
      const clean=englishDigits($('page-no-input').value);
      if(clean!==$('page-no-input').value)$('page-no-input').value=clean;
      const val=parseInt(clean,10);
      state.pageNumber=(!isNaN(val)&&val>0)?Math.max(1,val-(viewPage||0)):1;
      if($('page-no-val'))$('page-no-val').textContent=activePageNumber();
      save();
    });
    $('page-no-input').addEventListener('blur',()=>{
      $('page-no-input').value=activePageNumber();
      if($('page-no-val'))$('page-no-val').textContent=activePageNumber();
    });
  }
  $('branch-filter').onchange=()=>{selectedBranch=$('branch-filter').value;applyFilter();updatePartyTabsActive();};
  $('all-dates').onchange=()=>applyFilter();
  for(const id of ['search','date-from','date-to'])$(id).addEventListener('input',()=>applyFilter());
  if($('toggle-range'))$('toggle-range').onclick=()=>{const d=$('range-drawer');if(!d)return;d.hidden=!d.hidden;$('toggle-range').classList.toggle('active',!d.hidden||rangeActive());if(!d.hidden)$('date-from').focus();};
  if($('clear-range-btn'))$('clear-range-btn').onclick=()=>{for(const id of ['date-from','date-to'])$(id).value='';if($('range-drawer'))$('range-drawer').hidden=true;if($('toggle-range'))$('toggle-range').classList.remove('active');applyFilter();};
  function resetFilters(){ensureActiveParty();if($('branch-filter'))$('branch-filter').value=selectedBranch;$('all-dates').checked=false;for(const id of ['search','date-from','date-to'])$(id).value='';if($('range-drawer'))$('range-drawer').hidden=true;if($('toggle-range'))$('toggle-range').classList.remove('active');applyFilter();renderPartyTabs();}
  $('reset-filters').onclick=resetFilters;
  $('font-smaller').onclick=()=>{state.fontSize=Math.max(10,state.fontSize-1);applyFont();save();};$('font-larger').onclick=()=>{state.fontSize=Math.min(22,state.fontSize+1);applyFont();save();};
  $('title').addEventListener('input',()=>{state.title=$('title').value;if($('title-print'))$('title-print').textContent=$('title').value||'اندراج رجسٹر';save();});
  $('date').addEventListener('input',()=>{
    state.date=$('date').value;
    state.rows.forEach(row=>{if(!populated(row))row.entryDate=state.date||today();});
    save();
    applyFilter();
  });
  let summaryMode='date';
  function renderSummary(mode='date'){
    summaryMode=mode;
    const isParty=mode==='party';
    if($('summary-tab-date')){$('summary-tab-date').classList.toggle('active',!isParty);$('summary-tab-date').setAttribute('aria-selected',String(!isParty));}
    if($('summary-tab-party')){$('summary-tab-party').classList.toggle('active',isParty);$('summary-tab-party').setAttribute('aria-selected',String(isParty));}
    if($('summary-first-heading'))$('summary-first-heading').textContent=isParty?'پارٹی':'تاریخ';
    if($('summary-hint'))$('summary-hint').textContent=isParty?'کسی پارٹی پر کلک کریں تو اس پارٹی کا مکمل کھاتہ کھل جائے گا۔':'کسی تاریخ پر کلک کریں تو اسی دن کا رجسٹر کھل جائے گا۔';
    const rows=state.rows.filter(populated);
    const tbody=$('summary-rows');
    tbody.replaceChildren();
    $('summary-currency-heading').textContent=rows.some(r=>partyCurrency(r.branch)==='afn')?'روپیہ / افغانی':'روپیہ';
    let totCount=0,totBal=0n,totAed=0n;
    if(!isParty){
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
      if(!dates.length){
        const tr=document.createElement('tr');
        const td=document.createElement('td');
        td.colSpan=5;td.style.textAlign='center';td.textContent='ابھی کوئی انٹری موجود نہیں ہے۔';
        tr.append(td);tbody.append(tr);
      }
      for(const d of dates){
        const g=groups.get(d);
        totCount+=g.count;totBal+=g.balance;totAed+=g.aed;
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
        const tdPkr=document.createElement('td');tdPkr.textContent=currencyText(rows.filter(r=>(r.entryDate||state.date||today())===d));
        tr.append(tdDate,tdCount,tdBal,tdAed,tdPkr);
        tbody.append(tr);
      }
      $('summary-scope').textContent=`کل ${dates.length} دن، ${totCount} آرڈرز تعداد۔`;
    }else{
      const partyKeys=[...state.branches.slice().sort((a,b)=>a.localeCompare(b,'ur'))];
      if(rows.some(r=>!r.branch))partyKeys.push('');
      if(!partyKeys.length){
        const tr=document.createElement('tr');
        const td=document.createElement('td');
        td.colSpan=5;td.style.textAlign='center';td.textContent='ابھی کوئی پارٹی یا انٹری موجود نہیں ہے۔';
        tr.append(td);tbody.append(tr);
      }
      for(const pName of partyKeys){
        const pRows=rows.filter(r=>(r.branch||'')===pName);
        let bal=0n,aed=0n;
        for(const r of pRows){
          const b=integerAmount(r.balance),a=integerAmount(r.aed);
          if(b!==null)bal+=b;
          if(a!==null)aed+=a;
        }
        totCount+=pRows.length;totBal+=bal;totAed+=aed;
        const tr=document.createElement('tr');
        const label=pName?('🏢 '+pName):'بغیر پارٹی';
        tr.title=`${pName||'بغیر پارٹی'} کا کھاتہ کھولیں`;
        tr.onclick=()=>{
          $('all-dates').checked=true;
          $('date-from').value='';
          $('date-to').value='';
          if($('range-drawer'))$('range-drawer').hidden=true;
          if($('toggle-range'))$('toggle-range').classList.remove('active');
          selectPartyTab(pName?('b:'+pName):'__unassigned');
          $('summary-dialog').close();
        };
        const tdParty=document.createElement('td');tdParty.dir='rtl';tdParty.textContent=label;
        const tdCount=document.createElement('td');tdCount.textContent=String(pRows.length);
        const tdBal=document.createElement('td');tdBal.textContent=formatted(bal);
        const tdAed=document.createElement('td');tdAed.textContent=formatted(aed);
        const tdPkr=document.createElement('td');tdPkr.textContent=pRows.length?currencyText(pRows):(partyCurrency(pName)==='afn'?'0 (AFN)':'0');
        tr.append(tdParty,tdCount,tdBal,tdAed,tdPkr);
        tbody.append(tr);
      }
      $('summary-scope').textContent=`کل ${partyKeys.length} پارٹیاں، ${totCount} آرڈرز تعداد۔`;
    }
    $('summary-count').textContent=String(totCount);
    $('summary-balance').textContent=formatted(totBal);
    $('summary-aed').textContent=formatted(totAed);
    $('summary-pkr').textContent=currencyText(rows);
    if($('summary-status'))$('summary-status').textContent='';
  }
  function prepareSummaryOutput(){
    const sheet=document.createElement('article');
    sheet.className='summary-print-sheet';
    sheet.dir='rtl';
    const head=document.createElement('header');
    head.className='summary-print-head';
    const titleEl=document.createElement('h3');
    titleEl.textContent=(state.title||'اندراج رجسٹر')+' — '+(summaryMode==='party'?'پارٹی وار خلاصہ':'تاریخ وار خلاصہ');
    const metaEl=document.createElement('span');
    metaEl.className='summary-print-meta';
    metaEl.textContent=($('summary-scope')?.textContent||'')+'  |  تاریخ: '+fmtDate(today());
    head.append(titleEl,metaEl);
    const tbl=$('summary-table').cloneNode(true);
    tbl.removeAttribute('id');
    tbl.className='summary-print-table';
    tbl.querySelectorAll('td').forEach(td=>{if(td.textContent)td.textContent=td.textContent.replace(/^🏢\s*/,'');});
    sheet.append(head,tbl);
    $('receipt-print').replaceChildren(sheet);
    document.body.classList.add('summary-output');
  }
  async function outputSummaryPDF(){
    if(document.body.inert)return;
    if($('summary-status'))$('summary-status').textContent='';
    await document.fonts.ready;
    prepareSummaryOutput();
    if(!window.electronAPI?.savePDF){
      window.print();
      return;
    }
    document.body.inert=true;
    const modeLabel=summaryMode==='party'?'پارٹی_وار':'تاریخ_وار';
    try{
      const result=await window.electronAPI.savePDF('خلاصہ_'+modeLabel+'_'+today()+'.pdf');
      if(result?.status==='saved'&&result.filePath)recordSavedPdf(result.filePath);
      if($('summary-status'))$('summary-status').textContent=result?.status==='saved'?'✓ خلاصہ PDF رپورٹ محفوظ ہو گئی':result?.status==='busy'?'پہلی PDF مکمل ہونے دیں۔':result?.status==='error'?'PDF محفوظ نہیں ہو سکی؛ دوبارہ کوشش کریں۔':'';
    }catch{
      if($('summary-status'))$('summary-status').textContent='PDF محفوظ نہیں ہو سکی؛ دوبارہ کوشش کریں۔';
    }finally{
      document.body.inert=false;
      clearReceiptOutput();
    }
  }
  async function exportSummaryPNG(){
    if(document.body.inert)return;
    if($('summary-status'))$('summary-status').textContent='تصویر تیار ہو رہی ہے…';
    await document.fonts.ready;
    try{
      const headers=Array.from($('summary-table').querySelectorAll('thead th')).map(th=>th.textContent.trim());
      const bodyRows=Array.from($('summary-rows').querySelectorAll('tr')).map(tr=>Array.from(tr.children).map(td=>td.textContent.replace(/^🏢\s*/,'').trim()));
      const footCells=Array.from($('summary-table').querySelectorAll('tfoot tr > *')).map(el=>el.textContent.trim());
      const scale=2,W=960,pad=34,headH=70,thH=48,rowH=44,footH=48;
      const tableW=W-pad*2;
      const totalH=pad+headH+thH+Math.max(1,bodyRows.length)*rowH+footH+pad;
      const canvas=document.createElement('canvas');
      canvas.width=W*scale;canvas.height=totalH*scale;
      const ctx=canvas.getContext('2d');
      ctx.scale(scale,scale);
      ctx.fillStyle='#ffffff';
      ctx.fillRect(0,0,W,totalH);
      // Header
      const reportTitle=(state.title||'اندراج رجسٹر')+' — '+(summaryMode==='party'?'پارٹی وار خلاصہ':'تاریخ وار خلاصہ');
      const scopeText=($('summary-scope')?.textContent||'')+'  •  تاریخ: '+fmtDate(today());
      ctx.direction='rtl';
      ctx.fillStyle='#144d39';
      ctx.font="700 21px 'Noto Nastaliq Urdu','Jameel Noori Nastaleeq',Arial,sans-serif";
      ctx.textAlign='right';
      ctx.textBaseline='middle';
      ctx.fillText(reportTitle,W-pad,pad+26);
      ctx.fillStyle='#4b6859';
      ctx.font="600 13px 'Noto Nastaliq Urdu',Arial,sans-serif";
      ctx.textAlign='left';
      ctx.fillText(scopeText,pad,pad+28);
      ctx.strokeStyle='#17634c';
      ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(pad,pad+headH-12);ctx.lineTo(W-pad,pad+headH-12);ctx.stroke();
      // Columns (RTL right-to-left)
      const colRatios=[0.24,0.14,0.20,0.20,0.22];
      const colBounds=[];
      let curRight=W-pad;
      for(const r of colRatios){
        const cw=Math.round(tableW*r);
        colBounds.push({left:curRight-cw,right:curRight,center:curRight-cw/2,width:cw});
        curRight-=cw;
      }
      colBounds[colBounds.length-1].left=pad;
      colBounds[colBounds.length-1].width=colBounds[colBounds.length-1].right-pad;
      colBounds[colBounds.length-1].center=pad+colBounds[colBounds.length-1].width/2;
      let y=pad+headH;
      // Table Header
      ctx.fillStyle='#eaf2ed';
      ctx.fillRect(pad,y,tableW,thH);
      ctx.strokeStyle='#99aa9a';ctx.lineWidth=1;
      for(let c=0;c<colBounds.length;c++){
        const b=colBounds[c];
        ctx.strokeRect(b.left,y,b.width,thH);
        ctx.fillStyle='#1c4334';
        ctx.font="700 14px 'Noto Nastaliq Urdu',Arial,sans-serif";
        ctx.textAlign='center';
        ctx.fillText(headers[c]||'',b.center,y+thH/2+2);
      }
      y+=thH;
      // Body Rows
      for(let r=0;r<bodyRows.length;r++){
        const cells=bodyRows[r];
        ctx.fillStyle=r%2===1?'#f8fbf9':'#ffffff';
        ctx.fillRect(pad,y,tableW,rowH);
        if(cells.length===1){
          ctx.strokeStyle='#c5d6cb';
          ctx.strokeRect(pad,y,tableW,rowH);
          ctx.fillStyle='#557062';
          ctx.font="600 13px 'Noto Nastaliq Urdu',Arial,sans-serif";
          ctx.textAlign='center';
          ctx.fillText(cells[0],W/2,y+rowH/2+2);
        }else{
          for(let c=0;c<colBounds.length;c++){
            const b=colBounds[c];
            ctx.strokeStyle='#c5d6cb';
            ctx.strokeRect(b.left,y,b.width,rowH);
            ctx.fillStyle='#183329';
            ctx.font=c===0&&summaryMode==='party'?"700 13.5px 'Noto Nastaliq Urdu',Arial,sans-serif":"700 14px Arial,'Noto Nastaliq Urdu',sans-serif";
            ctx.textAlign='center';
            ctx.fillText(cells[c]||'',b.center,y+rowH/2+1);
          }
        }
        y+=rowH;
      }
      // Footer Row
      ctx.fillStyle='#e2efe6';
      ctx.fillRect(pad,y,tableW,footH);
      for(let c=0;c<colBounds.length;c++){
        const b=colBounds[c];
        ctx.strokeStyle='#99aa9a';
        ctx.strokeRect(b.left,y,b.width,footH);
        ctx.fillStyle='#114935';
        ctx.font=c===0?"700 14.5px 'Noto Nastaliq Urdu',Arial,sans-serif":"700 14.5px Arial,'Noto Nastaliq Urdu',sans-serif";
        ctx.textAlign='center';
        ctx.fillText(footCells[c]||'',b.center,y+footH/2+1);
      }
      const modeLabel=summaryMode==='party'?'پارٹی_وار':'تاریخ_وار';
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw Error('PNG failed');
      download(blob,'خلاصہ_'+modeLabel+'_'+today()+'.png');
      if($('summary-status'))$('summary-status').textContent='✓ خلاصہ PNG تصویر محفوظ ہو گئی';
    }catch{
      if($('summary-status'))$('summary-status').textContent='تصویر محفوظ نہیں ہو سکی؛ دوبارہ کوشش کریں۔';
    }
  }
  function openSummary(){
    renderSummary('date');
    $('summary-dialog').showModal();
  }
  if($('summary-tab-date'))$('summary-tab-date').onclick=()=>renderSummary('date');
  if($('summary-tab-party'))$('summary-tab-party').onclick=()=>renderSummary('party');
  if($('summary-pdf'))$('summary-pdf').onclick=()=>outputSummaryPDF();
  if($('summary-png'))$('summary-png').onclick=()=>exportSummaryPNG();
  $('summary-open').onclick=()=>openSummary();
  $('close-summary').onclick=()=>$('summary-dialog').close();
  $('summary-dialog')?.addEventListener('close',()=>clearReceiptOutput());
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
      currSelect.onchange=()=>{if([...state.rows,...state.trash.map(t=>t.row)].some(r=>r.branch===name&&populated(r))){currSelect.value=partyCurrency(name);$('branch-error').textContent='اس پارٹی کی انٹریاں موجود ہیں؛ نئی کرنسی کے لیے الگ پارٹی بنائیں۔';return;}if(!state.partyCurrencies)state.partyCurrencies={};state.partyCurrencies[name]=currSelect.value;save();updateBranches();applyFilter();$('branch-error').textContent=name+' کی کرنسی اب '+(currSelect.value==='afn'?'افغانی':'روپیہ')+' ہے۔';};
      const rename=document.createElement('button');rename.textContent='نام محفوظ کریں';rename.onclick=()=>{const next=cleanName(input.value);if(!next){$('branch-error').textContent='پارٹی کا نام لکھیں۔';return;}if(state.branches.some(n=>n!==name&&nameKey(n)===nameKey(next))){$('branch-error').textContent='یہ نام پہلے سے موجود ہے۔';return;}state.branches[state.branches.indexOf(name)]=next;if(next!==name&&state.partyCurrencies&&Object.hasOwn(state.partyCurrencies,name)){state.partyCurrencies[next]=state.partyCurrencies[name];delete state.partyCurrencies[name];}if(next!==name&&state.partySerials&&Object.hasOwn(state.partySerials,name)){state.partySerials[next]=state.partySerials[name];delete state.partySerials[name];}for(const row of [...state.rows,...state.trash.map(t=>t.row)])if(row.branch===name)row.branch=next;if(selectedBranch==='b:'+name)selectedBranch='b:'+next;save();updateBranches();applyFilter();renderBranchList();$('branch-error').textContent='نام اور متعلقہ انٹریاں اپ ڈیٹ ہو گئیں۔';};
      const remove=document.createElement('button');remove.textContent='ہٹائیں';remove.onclick=()=>{if(state.rows.some(r=>r.branch===name&&populated(r))||state.trash.some(t=>t.row.branch===name)){$('branch-error').textContent='اس پارٹی کی انٹریاں موجود ہیں؛ پہلے ان کی پارٹی تبدیل کریں۔';return;}state.rows.forEach(r=>{if(r.branch===name)r.branch='';});state.branches=state.branches.filter(n=>n!==name);if(state.partyCurrencies)delete state.partyCurrencies[name];if(state.partySerials)delete state.partySerials[name];if(selectedBranch==='b:'+name){selectedBranch='';ensureActiveParty();}save();updateBranches();applyFilter();renderBranchList();$('branch-error').textContent='پارٹی ہٹا دی گئی۔';};div.append(input,currSelect,count,rename,remove);$('branch-list').append(div);
    }
  }
  $('branch-form').onsubmit=e=>{e.preventDefault();const name=cleanName($('branch-name').value);if(!name)return;const existing=state.branches.find(n=>nameKey(n)===nameKey(name));if(existing){$('branch-error').textContent='یہ پارٹی پہلے سے موجود ہے؛ فہرست سے منتخب کریں۔';return;}const curr=$('branch-currency')?.value||'pkr';state.branches.push(name);if(!state.partyCurrencies)state.partyCurrencies={};state.partyCurrencies[name]=curr;if(pendingBranchRow)pendingBranchRow.branch=name;else selectedBranch='b:'+name;save();updateBranches();applyFilter(true);renderBranchList();$('branch-name').value='';$('branch-error').textContent='پارٹی شامل ہو گئی ('+(curr==='afn'?'افغانی':'روپیہ')+')۔';if(pendingBranchRow){const target=pendingBranchRow;$('branch-dialog').close();focusRow(target);}else{$('branch-dialog').close();}};
  let receiptSelection=null,lastSavedPdfPath='';
  function recordSavedPdf(filePath){
    if(!filePath||!window.electronAPI?.openFile)return;
    lastSavedPdfPath=filePath;
    if($('open-pdf'))$('open-pdf').hidden=false;
    if($('open-pdf-folder'))$('open-pdf-folder').hidden=false;
  }
  if($('open-pdf'))$('open-pdf').onclick=()=>{if(lastSavedPdfPath)window.electronAPI?.openFile?.(lastSavedPdfPath);};
  if($('open-pdf-folder'))$('open-pdf-folder').onclick=()=>{if(lastSavedPdfPath)window.electronAPI?.showInFolder?.(lastSavedPdfPath);};
  function openReceipt(row,serial){
    if(!canOutput([row],false))return;
    receiptSelection={serial:String(serial),date:row.entryDate||state.date||today(),branch:row.branch||'بغیر پارٹی'};
    const values={title:state.title||'اندراج رجسٹر',serial:String(serial),date:fmtDate(receiptSelection.date),branch:receiptSelection.branch,sender:row.sender||'—',mobile:row.mobile||'—',receiver:row.receiver||'—',place:row.place||'—',balance:formatted(integerAmount(row.balance)),aed:formatted(integerAmount(row.aed)),pkr:formatted(integerAmount(row.pkr)),currency:partyCurrency(row.branch)==='afn'?'افغانی (AFN)':'روپیہ (PKR)'};
    for(const [field,value] of Object.entries(values))$('receipt-paper').querySelector('[data-receipt="'+field+'"]').textContent=value;
    $('receipt-status').textContent='';$('receipt-save').hidden=false;$('receipt-png').hidden=false;
    if($('receipt-copy')){$('receipt-copy').hidden=false;$('receipt-copy').disabled=!window.electronAPI?.copyReceiptPNG&&!(window.ClipboardItem&&navigator.clipboard?.write);$('receipt-copy').title=$('receipt-copy').disabled?'اس براؤزر میں تصویر کاپی دستیاب نہیں؛ PNG ڈاؤن لوڈ کریں':'تصویر کاپی کریں';}
    $('receipt-dialog').showModal();
  }
  $('receipt-png').onclick=async()=>{
    if(!receiptSelection||document.body.inert)return;
    const selection={...receiptSelection};const values={};
    $('receipt-paper').querySelectorAll('[data-receipt]').forEach(el=>{values[el.dataset.receipt]=el.textContent;});
    document.body.inert=true;$('receipt-status').textContent='تصویر تیار ہو رہی ہے…';
    try{
      const filename=selection.branch+'_'+selection.date+'_رسید-'+selection.serial+'.png';
      let result;
      if(window.electronAPI?.saveReceiptPNG)result=await window.electronAPI.saveReceiptPNG(values,filename);
      else{const blob=await window.createReceiptPNG(values);download(blob,filename.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-'));result={status:'saved'};}
      $('receipt-status').textContent=result.status==='saved'?'✓ PNG رسید محفوظ ہو گئی':result.status==='cancelled'?'':result.status==='busy'?'پہلی تصویر مکمل ہونے دیں۔':'تصویر محفوظ نہیں ہو سکی؛ دوبارہ کوشش کریں۔';
    }catch{$('receipt-status').textContent='تصویر محفوظ نہیں ہو سکی؛ دوبارہ کوشش کریں۔';}
    finally{document.body.inert=false;}
  };
  if($('receipt-copy'))$('receipt-copy').onclick=async()=>{
    if(!receiptSelection||document.body.inert)return;
    const values={};
    $('receipt-paper').querySelectorAll('[data-receipt]').forEach(el=>{values[el.dataset.receipt]=el.textContent;});
    document.body.inert=true;$('receipt-status').textContent='تصویر کاپی ہو رہی ہے…';
    try{
      let result;if(window.electronAPI?.copyReceiptPNG)result=await window.electronAPI.copyReceiptPNG(values);else{const image=window.createReceiptPNG(values);await navigator.clipboard.write([new ClipboardItem({'image/png':image})]);result={status:'copied'};}
      $('receipt-status').textContent=result.status==='copied'?'✓ رسید کی تصویر کاپی ہو گئی (WhatsApp میں Ctrl+V کریں)':result.status==='busy'?'پہلی تصویر مکمل ہونے دیں۔':'تصویر کاپی نہیں ہو سکی؛ دوبارہ کوشش کریں۔';
    }catch{$('receipt-status').textContent='تصویر کاپی نہیں ہو سکی؛ دوبارہ کوشش کریں۔';}
    finally{document.body.inert=false;}
  };
  function prepareReceiptOutput(){
    const sheet=$('receipt-paper').cloneNode(true);sheet.removeAttribute('id');sheet.classList.add('receipt-export');$('receipt-print').replaceChildren(sheet);document.body.classList.add('receipt-output');
  }
  function clearReceiptOutput(){document.body.classList.remove('receipt-output','summary-output');$('receipt-print').replaceChildren();}
  $('close-receipt').onclick=()=>$('receipt-dialog').close();
  $('receipt-dialog').addEventListener('close',()=>{receiptSelection=null;clearReceiptOutput();});
  async function outputReceipt(savePDF=false){
    if(!receiptSelection||document.body.inert)return;
    const selection={...receiptSelection};
    $('receipt-status').textContent='';
    await document.fonts.ready;
    prepareReceiptOutput();
    if(!window.electronAPI?.previewPDF){window.print();return;}
    document.body.inert=true;
    try{
      const result=savePDF?await window.electronAPI.savePDF(selection.branch+'_'+selection.date+'_رسید-'+selection.serial+'.pdf'):await window.electronAPI.previewPDF();
      if(result?.status==='saved'&&result.filePath)recordSavedPdf(result.filePath);
      $('receipt-status').textContent=result.status==='saved'?'✓ رسید محفوظ ہو گئی':result.status==='busy'?'پہلی PDF مکمل ہونے دیں۔':result.status==='error'?'رسید نہیں بن سکی؛ دوبارہ کوشش کریں۔':'';
    }catch{$('receipt-status').textContent='رسید نہیں بن سکی؛ دوبارہ کوشش کریں۔';}
    finally{document.body.inert=false;clearReceiptOutput();}
  }
  $('receipt-preview').onclick=()=>outputReceipt();$('receipt-save').onclick=()=>outputReceipt(true);
  const groupedPrint=document.createElement('div');groupedPrint.id='grouped-register-print';document.body.append(groupedPrint);
  function clearGroupedPrint(){document.body.classList.remove('grouped-register-output');groupedPrint.replaceChildren();}
  function prepareGroupedPrint(){
    clearGroupedPrint();
    const all=selectedRows();
    if(!all.length)return;

    const orderCategories=[{type:'bank',name:'بینک / والٹ آرڈرز'},{type:'city',name:'شہر آرڈرز'},{type:'',name:'دیگر آرڈرز'}];
    const activeCategories=orderCategories
      .map(cat=>({...cat,rows:all.filter(r=>(r.orderType||'')===cat.type)}))
      .filter(cat=>cat.rows.length>0);

    let totalBalance=0n,totalAed=0n,invalidAny=false;
    for(const r of all){
      const b=integerAmount(r.balance),a=integerAmount(r.aed);
      if(b===null||a===null)invalidAny=true;
      if(b!==null)totalBalance+=b;
      if(a!==null)totalAed+=a;
    }
    const netAed=totalAed-totalBalance;
    const allPkrText=currencyText(all).split('\n').map(s=>`(${s})`).join('\n');
    const startPage=activePageNumber();

    let currentSerial=activeStartSerial();
    activeCategories.forEach((cat,idx)=>{
      const isLast=idx===activeCategories.length-1;
      const section=document.createElement('section');section.className='order-print-section';
      const head=document.querySelector('.paper-head').cloneNode(true);
      const pageVal=head.querySelector('.page-no-val');
      if(pageVal)pageVal.textContent=String(startPage+idx);
      if(cat.type){
        const bHead=head.querySelector('#branch-heading')||head.querySelector('.head-party strong');
        if(bHead){
          const catTag=document.createElement('span');
          catTag.className='order-type-print-badge';
          catTag.textContent=` (${cat.name})`;
          bHead.append(catTag);
        }
      }
      section.append(head);

      const table=document.createElement('table');
      const thead=document.querySelector('.table-wrap table thead').cloneNode(true);
      thead.querySelectorAll('.no-print').forEach(el=>el.remove());
      table.append(thead);

      const body=document.createElement('tbody');
      for(const row of cat.rows){
        const tr=document.createElement('tr');

        const tdNum=document.createElement('td');tdNum.className='number';
        tdNum.textContent=String(currentSerial++);
        tr.append(tdNum);

        const tdSender=document.createElement('td');tdSender.className='person col-sender';
        const spanSender=document.createElement('span');spanSender.className='print-value';
        spanSender.textContent=row.sender||'';
        tdSender.append(spanSender);
        tr.append(tdSender);

        const tdMobile=document.createElement('td');tdMobile.className='mobile col-mobile';
        const spanMobile=document.createElement('span');spanMobile.className='print-value';
        spanMobile.dir='ltr';
        spanMobile.textContent=row.mobile||'';
        tdMobile.append(spanMobile);
        tr.append(tdMobile);

        const tdReceiver=document.createElement('td');tdReceiver.className='person col-receiver';
        const spanReceiver=document.createElement('span');spanReceiver.className='print-value';
        spanReceiver.textContent=row.receiver||'';
        tdReceiver.append(spanReceiver);
        tr.append(tdReceiver);

        const tdPlace=document.createElement('td');tdPlace.className='place col-place';
        const spanPlace=document.createElement('span');spanPlace.className='print-value';
        spanPlace.textContent=row.place||'';
        tdPlace.append(spanPlace);
        tr.append(tdPlace);

        const tdBal=document.createElement('td');tdBal.className='money col-balance';
        const spanBal=document.createElement('span');spanBal.className='print-value';spanBal.dir='ltr';
        const bAmt=integerAmount(row.balance);
        const balText=wholeText(row.balance);
        if(row.balanceType&&row.balanceType.trim()&&(bAmt!==null&&bAmt!==0n)){
          const tag=document.createElement('small');tag.className='print-bal-tag';
          tag.textContent=`(${row.balanceType.trim()})`;
          const numSpan=document.createElement('span');numSpan.className='print-bal-num';
          numSpan.textContent=balText;
          spanBal.replaceChildren(tag,numSpan);
        }else{
          spanBal.textContent=balText;
        }
        tdBal.append(spanBal);
        tr.append(tdBal);

        const tdAed=document.createElement('td');tdAed.className='money col-aed';
        const spanAed=document.createElement('span');spanAed.className='print-value';spanAed.dir='ltr';
        spanAed.textContent=wholeText(row.aed);
        tdAed.append(spanAed);
        tr.append(tdAed);

        const tdPkr=document.createElement('td');tdPkr.className='money col-pkr';
        const spanPkr=document.createElement('span');spanPkr.className='print-value';spanPkr.dir='ltr';
        spanPkr.textContent=wholeText(row.pkr);
        tdPkr.append(spanPkr);
        tr.append(tdPkr);

        body.append(tr);
      }
      table.append(body);

      if(isLast){
        const foot=document.createElement('tfoot');
        foot.className='register-totals';

        const gapTr=document.createElement('tr');gapTr.className='totals-gap';gapTr.setAttribute('aria-hidden','true');
        const gapTd=document.createElement('td');gapTd.colSpan=8;gapTr.append(gapTd);
        foot.append(gapTr);

        const grandTr=document.createElement('tr');grandTr.className='totals-row grand-total-row';
        const grandTh=document.createElement('th');grandTh.colSpan=5;grandTh.scope='row';
        const titleWrap=document.createElement('div');titleWrap.className='totals-title-wrap';
        const titleSpan=document.createElement('span');titleSpan.textContent='کل مجموعہ حساب';
        const countSpan=document.createElement('span');countSpan.className='orders-count-badge';countSpan.textContent=`آرڈرز تعداد: ${all.length}`;
        const netSpan=document.createElement('span');netSpan.className='net-aed-badge';netSpan.textContent=invalidAny?'موجودہ درہم: رقم درست کریں':`موجودہ درہم: ${formatted(netAed)}`;
        titleWrap.append(titleSpan,countSpan,netSpan);grandTh.append(titleWrap);grandTr.append(grandTh);

        const balTd=document.createElement('td');balTd.id='total-balance';balTd.className='amount';balTd.textContent=formatted(totalBalance);
        const aedTd=document.createElement('td');aedTd.id='total-aed';aedTd.className='amount';aedTd.textContent=formatted(totalAed);
        const pkrTd=document.createElement('td');pkrTd.id='total-pkr';pkrTd.className='amount';pkrTd.textContent=allPkrText;
        grandTr.append(balTd,aedTd,pkrTd);
        foot.append(grandTr);
        table.append(foot);
      }
      section.append(table);
      groupedPrint.append(section);
    });

    groupedPrint.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    document.body.classList.add('grouped-register-output');
  }
  function preparePrint(){if(journalController?.isActive()){journalController.preparePrint();return;}if(document.body.classList.contains('receipt-output')||document.body.classList.contains('summary-output'))return;registerPrintActive=true;applyFilter(false,true);const datePrint=$('date-print-val');if(datePrint)datePrint.textContent=fmtDate($('date').value||today());const titlePrint=$('title-print');if(titlePrint)titlePrint.textContent=$('title').value||state.title||'اندراج رجسٹر';const currPage=activePageNumber();if($('page-no-val'))$('page-no-val').textContent=currPage;const resetVal=Math.max(0,currPage-1);document.documentElement.style.setProperty('--print-start-page',String(resetVal));document.querySelectorAll('.print-value').forEach(e=>e.remove());state.rows.forEach(row=>{const tr=rowNodes.get(row.id);if(!tr)return;tr.classList.toggle('empty-row',!matches(row));tr.querySelectorAll('input,select,textarea').forEach(input=>{if(input.classList.contains('no-print')||input.closest('.no-print')||input.dataset.field==='balanceType')return;const span=document.createElement('span');span.className='print-value';const isAmt=input.classList.contains('amount');const valText=isAmt?wholeText(input.value):input.value;const bAmt=integerAmount(row.balance);if(input.dataset.field==='balance'&&row.balanceType&&row.balanceType.trim()&&(bAmt!==null&&bAmt!==0n)){const small=document.createElement('small');small.className='print-bal-tag';small.textContent=`(${row.balanceType.trim()})`;const numSpan=document.createElement('span');numSpan.className='print-bal-num';numSpan.textContent=valText;span.replaceChildren(small,numSpan);}else{span.textContent=valText;}if(['amount','phone'].some(c=>input.classList.contains(c))){span.dir='ltr';span.style.textAlign=input.dataset.field==='pkr'?'left':'center';}if(input.dataset.field==='place'){span.style.textAlign='center';}input.after(span);});});prepareGroupedPrint();}
  window.addEventListener('beforeprint',()=>{if($('receipt-dialog').open)prepareReceiptOutput();else if($('summary-dialog').open)prepareSummaryOutput();else preparePrint();});window.addEventListener('afterprint',()=>{registerPrintActive=false;clearGroupedPrint();document.documentElement.style.removeProperty('--print-start-page');clearReceiptOutput();applyFilter();});
  function canOutput(rows,filtered=true){if(filtered&&!rangeValid()){alert('تاریخ کا دورانیہ درست کریں۔');return false;}if(!rows.length){alert('کوئی انٹری منتخب نہیں ہے۔');return false;}if(rows.some(r=>moneyFields.some(f=>integerAmount(r[f])===null))){alert('رقم کے خانے درست کریں۔ صرف مکمل عدد لکھیں؛ پرانی اعشاری رقم خود تبدیل نہیں کی گئی۔');return false;}return true;}
  if(!window.electronAPI?.savePDF){
    $('save-pdf').hidden=false;$('save-pdf').title='براؤزر پرنٹ میں Save as PDF منتخب کریں';
    $('save-pdf').onclick=()=>{if(journalController?.isActive())journalController.output(true);else $('print').click();};
    $('receipt-save').title='براؤزر پرنٹ میں Save as PDF منتخب کریں';
    $('summary-pdf').title='براؤزر پرنٹ میں Save as PDF منتخب کریں';
  }
  if(window.electronAPI?.savePDF){
    const button=$('save-pdf');button.hidden=false;
    button.onclick=async()=>{
      if(journalController?.isActive()){const res=await journalController.output(true);if(res?.status==='saved'&&res.filePath)recordSavedPdf(res.filePath);return;}
      const rows=selectedRows();if(!canOutput(rows))return;
      const party=selectedBranch.startsWith('b:')?selectedBranch.slice(2):selectedBranch==='__unassigned'?'بغیر پارٹی':'تمام پارٹیاں';
      const dates=rows.map(r=>r.entryDate||state.date).filter(Boolean).sort();
      const date=dayMode()?state.date:dates[0]===dates[dates.length-1]?dates[0]:dates[0]+'_'+dates[dates.length-1];
      const label=Array.from(button.childNodes,node=>node.cloneNode(true));button.disabled=true;document.body.inert=true;
      try{
        await document.fonts.ready;preparePrint();
        const result=await window.electronAPI.savePDF(party+'_'+date+'.pdf');
        if(result.status==='saved'){button.textContent='✓ PDF محفوظ ہو گئی';if(result.filePath)recordSavedPdf(result.filePath);}
        else if(result.status==='error')alert('PDF محفوظ نہیں ہو سکی۔ دوسری جگہ منتخب کریں یا کھلی ہوئی فائل بند کریں۔');
      }catch{alert('PDF محفوظ نہیں ہو سکی۔ دوبارہ کوشش کریں۔');}
      finally{registerPrintActive=false;clearGroupedPrint();document.documentElement.style.removeProperty('--print-start-page');document.body.inert=false;button.disabled=false;applyFilter();setTimeout(()=>{button.replaceChildren(...label);},2500);}
    };
  }
  $('print').onclick=async()=>{
    if(journalController?.isActive()){await journalController.output();return;}
    if(!canOutput(selectedRows()))return;
    await document.fonts.ready;
    if(!window.electronAPI?.previewPDF){window.print();return;}
    document.body.inert=true;
    try{preparePrint();const result=await window.electronAPI.previewPDF();if(result.status==='error')alert('پرنٹ پیش منظر نہیں کھل سکا۔ دوبارہ کوشش کریں۔');}
    catch{alert('پرنٹ پیش منظر نہیں کھل سکا۔ دوبارہ کوشش کریں۔');}
    finally{registerPrintActive=false;clearGroupedPrint();document.documentElement.style.removeProperty('--print-start-page');document.body.inert=false;applyFilter();}
  };
  const topNavEl=document.querySelector('.top-nav');
  if(topNavEl&&typeof ResizeObserver!=='undefined'){
    const syncTopNavH=()=>document.documentElement.style.setProperty('--top-nav-h',topNavEl.offsetHeight+'px');
    syncTopNavH();
    new ResizeObserver(syncTopNavH).observe(topNavEl);
  }
  window.addEventListener('keydown',e=>{
    if(!$('pin-lock-overlay')?.hidden)return;
    if((e.ctrlKey||e.metaKey)&&(e.key==='p'||e.key==='P')){e.preventDefault();$('print').click();}
    if((e.ctrlKey||e.metaKey)&&(e.key==='l'||e.key==='L')&&!e.shiftKey&&state.pinCode){
      e.preventDefault();
      requestPinUnlock('ایپ لاک کر دی گئی ہے۔ کھولنے کے لیے پن کوڈ درج کریں۔',false);
      return;
    }
    if((e.ctrlKey||e.metaKey)&&(e.key==='z'||e.key==='Z')&&!e.shiftKey&&!journalController?.isActive()){
      const active=document.activeElement;
      const inInput=active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.isContentEditable);
      if(!inInput&&state.trash.length){e.preventDefault();$('undo').click();}
    }
    if(e.altKey&&!e.ctrlKey&&!e.metaKey&&!journalController?.isActive()){
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){
        const tabs=Array.from($('party-tabs')?.querySelectorAll('.party-tab')||[]);
        if(tabs.length>1){
          e.preventDefault();
          const curIdx=tabs.findIndex(t=>t.classList.contains('active'));
          const step=e.key==='ArrowLeft'?1:-1;
          const nextTab=tabs[(curIdx+step+tabs.length)%tabs.length];
          if(nextTab){nextTab.click();nextTab.scrollIntoView({block:'nearest',inline:'nearest'});}
        }
      }else if(/^[0-9]$/.test(e.key)){
        const tabs=Array.from($('party-tabs')?.querySelectorAll('.party-tab')||[]);
        const target=tabs[Number(e.key)];
        if(target){
          e.preventDefault();
          target.click();
          target.scrollIntoView({block:'nearest',inline:'nearest'});
        }
      }
    }
  });
  if(window.electronAPI?.onMenuAction){
    window.electronAPI.onMenuAction(action=>{
      if(action==='add-row')add();
      else if(action==='print')$('print').click();
      else if(action==='export'){if(journalController?.isActive())journalController.exportExcel();else $('export-open').click();}
      else if(action==='summary'){if(!journalController?.isActive())openSummary();}
      else if(action==='branches')openBranches();
      else if(action==='reset-filters')resetFilters();
    });
  }
  function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function backup(){const time=new Date().toISOString();const snapshot={...state,rows:state.rows.filter(populated),lastBackupAt:time};download(new Blob([JSON.stringify(snapshot,null,2)],{type:'application/json'}),`hisaab-backup-${today()}.json`);state.lastBackupAt=time;save();updateBackup();}
  $('backup').onclick=backup;$('backup-now').onclick=backup;setInterval(updateBackup,60000);
  $('restore').onclick=()=>$('file').click();
  $('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>15000000)throw Error('Large file');await restoreBackupData(JSON.parse(await file.text()));}catch{alert('یہ درست حساب بیک اَپ نہیں ہے۔ موجودہ ڈیٹا تبدیل نہیں ہوا۔');}finally{e.target.value='';}};
  $('export-open').onclick=()=>{if(journalController?.isActive())journalController.exportExcel();else $('export-dialog').showModal();};$('close-export').onclick=()=>$('export-dialog').close();
  function exportExcel(all){
    const rows=all?state.rows.filter(populated):selectedRows();if(!canOutput(rows,!all))return;
    const start=all?(Number(state.startSerial)||1):activeStartSerial();const mixed=new Set(rows.map(r=>partyCurrency(r.branch))).size>1;
    const onlyAfn=rows.every(r=>partyCurrency(r.branch)==='afn');
    const headers=['نمبر شمار','تاریخ','ارسال کنندہ','موبائیل نمبر','وصول کنندہ','مقام','پارٹی','بقایا','درہم',mixed?'روپیہ (PKR)':onlyAfn?'افغانی (AFN)':'روپیہ (PKR)'];if(mixed)headers.push('افغانی (AFN)');
    const num=v=>({number:String(v)});
    const data=rows.map((r,i)=>{const values=[start+i,r.entryDate||state.date,...fields.map(f=>moneyFields.includes(f)?num(f==='pkr'&&mixed&&partyCurrency(r.branch)==='afn'?0n:integerAmount(r[f])):r[f])];if(mixed)values.push(num(partyCurrency(r.branch)==='afn'?integerAmount(r.pkr):0n));return values;});
    const {sums}=currencyTotals(rows);const tail=['کل مجموعہ حساب','',`آرڈرز تعداد: ${rows.length}`,'','','','',...['balance','aed'].map(f=>num(rows.reduce((n,r)=>n+integerAmount(r[f]),0n))),num(mixed?sums.pkr:onlyAfn?sums.afn:sums.pkr)];if(mixed)tail.push(num(sums.afn));
    download(window.HisaabExcel.create([headers,...data,tail]),`hisaab-${all?'all':'filtered'}-${today()}.xlsx`);$('export-dialog').close();
  }
  $('export-filtered').onclick=()=>exportExcel(false);$('export-all').onclick=()=>exportExcel(true);
  async function initMongoWebState() {
    if (!isWebMode) return;
    updateLogoutBtn();
    try {
      const token = getAuthToken();
      const statusRes = await fetch('/api/auth/status', {
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      });
      if (statusRes.ok) {
        const authInfo = await statusRes.json();
        if ($('pin-default-hint')) $('pin-default-hint').hidden = !authInfo.isDefaultPin;
        if (authInfo.needsSetup) {
          const ok = await requestWebLogin('پہلی بار استعمال کے لیے نیا سیکیورٹی پن (PIN) کوڈ سیٹ کریں', true);
          if (!ok) return;
        } else if (!authInfo.isAuthenticated) {
          const ok = await requestWebLogin('جاری رکھنے کے لیے اپنا پاس ورڈ / پن کوڈ درج کریں', false);
          if (!ok) return;
        }
      }

      const res = await fetch('/api/state', {
        headers: { 'Authorization': 'Bearer ' + getAuthToken() }
      });
      if (res.status === 401) {
        setAuthToken('');
        requestWebLogin('لاگ ان کی مدت ختم ہو گئی۔ دوبارہ پاس ورڈ لکھیں۔');
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'ok' && data.state) {
        storageRevision = data.revision || 0;
        state = migrate(data.state);
        localStorage.setItem(KEY, JSON.stringify(state));
        render();
        savedStatus();
      } else if (data.status === 'empty') {
        const currentClean = {...state, rows: state.rows.filter(populated)};
        if (currentClean.rows.length > 0 || currentClean.branches.length > 0) {
          pushToMongo(currentClean);
        }
      }
      const help = $('storage-help');
      if (help) help.textContent = 'ڈیٹا براہِ راست کلاؤڈ MongoDB Atlas میں محفوظ ہو رہا ہے۔';
    } catch (e) {
      console.warn('Could not sync MongoDB on startup:', e);
    }
  }

  render();
  updatePinUI();
  if(!isWebMode && state.pinCode) requestPinUnlock('جاری رکھنے کے لیے اپنا حفاظتی پن کوڈ (PIN) درج کریں',false);
  journalController=window.HisaabJournal.mount({getState:()=>state,save,today,exportSheet:(rows,name)=>download(window.HisaabExcel.create(rows),name)});
  save();
  initDiskPersistence();
  initMongoWebState();
})();

