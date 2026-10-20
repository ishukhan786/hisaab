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
  const formatAllah = value => String(value).replace(/(^|[\s\u060C\u06D4()\-]|\u0639\0628\062F|\u0621)\u0627\0644\u0644[\u0651\u0670]*[\u06C1\u0647](?=$|[\s\u060C\u06D4()\-])/g, '$1\uFDF2');
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
  let state={journal:{date:today(),rows:[]},version:4,title:'Hisaab Register',date:today(),pageNumber:1,startSerial:1,partySerials:Object.create(null),fontSize:13,branches:[],partyCurrencies:Object.create(null),lockedDates:[],pinCode:'',trash:[],lastBackupAt:null};
  function activePageNumber(){return (Number(state.pageNumber)||1)+(viewPage||0);}
  const partyCurrency=name=>name&&Object.hasOwn(state.partyCurrencies||{},name)&&state.partyCurrencies[name]==='afn'?'afn':'pkr';
  function currencyTotals(rows){const sums={pkr:0n,afn:0n},invalid=new Set();for(const r of rows){const c=partyCurrency(r.branch),v=integerAmount(r.pkr);if(v===null)invalid.add(c);else sums[c]+=v;const a=integerAmount(r.aed);if(a===null)invalid.add(c);else sums[c]+=a;const b=integerAmount(r.balance);if(b===null)invalid.add(c);else sums[c]+=b;}return {sums,invalid};}
  function currencyText(rows){const currencies=[...new Set(rows.map(r=>partyCurrency(r.branch)))];const {sums,invalid}=currencyTotals(rows);return (currencies.length?currencies:['pkr']).map(c=>`${formatted(sums[c]||0n)} ${c.toUpperCase()}`).join(' • ') + (invalid.size ? ' ⚠️' : '');}
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
    if(!source || ![1,2,3,4].includes(source.version) || typeof source.title!=='string' || source.title.length>100 || typeof source.date!=='string' || (source.date && !dateValid(source.date)) || ![...]
    const registry=[];
    function register(name){if(typeof name!=='string'||name.length>300)throw Error('Invalid party');const cleaned=cleanName(name);if(!cleaned)return '';const existing=registry.find(n=>nameKey(n)===nameKey(cleaned));if(existing)return existing;registry.push(cleaned);return cleaned;}
    if(source.branches!==undefined && (!Array.isArray(source.branches)||source.branches.length>10000))throw Error('Invalid parties');
    (source.branches||[]).forEach(register);
    const ids=new Set();
    function convert(row){
      if(!row||typeof row!=='object')throw Error('Invalid row');
      const result={};
      rowFields.forEach(f=>{const v=row[f]===undefined&&['orderType','balanceType','entryDate','branch'].includes(f)?'':row[f];if(typeof v!=='string'||v.length>300)throw Error('Invalid field');result[f]=v;});
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
    const partyCurrencies=Object.create(null);for(const name of registry){const raw=source.partyCurrencies;if(raw&&Object.hasOwn(raw,name)){if(!['pkr','afn'].includes(raw[name]))throw Error('Invalid currency');partyCurrencies[name]=raw[name];}else partyCurrencies[name]='pkr';}
    const lockedDates=Array.isArray(source.lockedDates)?source.lockedDates.filter(d=>typeof d==='string'&&dateValid(d)):[];
    const pinCode=typeof source.pinCode==='string'&&/^\d{4,8}$/.test(source.pinCode)?source.pinCode:'';
    const titleVal = (!source.title || source.title === 'اندراج رجسٹر') ? 'Hisaab Register' : formatAllah(source.title);
    return {journal:window.HisaabJournal.normalize(source.journal,source.date||today()),version:4,title:titleVal,date:source.date||today(),pageNumber:Number.isInteger(source.pageNumber)&&source.pageNumber>0?source.pageNumber:1,startSerial,partySerials,partyCurrencies,branches:registry,lockedDates,pinCode,rows,trash};
  }
  const isWebMode = !nativeStorage && window.location.protocol.startsWith('http');
  const AUTH_KEY = 'hisaab-auth-token-v1';
  const getAuthToken = () => {
    try {
      const localToken = localStorage.getItem(AUTH_KEY);
      if (localToken) return localToken;
      return sessionStorage.getItem(AUTH_KEY) || '';
    } catch (_) {
      try { return sessionStorage.getItem(AUTH_KEY) || ''; } catch (_) { return ''; }
    }
  };
  const setAuthToken = token => {
    try {
      if (token) {
        localStorage.setItem(AUTH_KEY, token);
        sessionStorage.setItem(AUTH_KEY, token);
      } else {
        localStorage.removeItem(AUTH_KEY);
        sessionStorage.removeItem(AUTH_KEY);
      }
    } catch (_) {}
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
          if (confirm('سرور پر نیا ڈیٹا آ چکا ہے۔ کیا آپ نیا ڈیٹا لوڈ کرنا چاہتے ہیں؟ (آپ کی مقامی غیر محفوظ تبدیلیاں ضائع ہو سکتی ہیں)')) {
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
      state.date=today();
    }else{
      const raw=localStorage.getItem(KEY);if(raw)state=migrate(JSON.parse(raw));
      state.date=today();
      if(isWebMode){
        const help=$('storage-help');if(help)help.textContent='ڈیٹا کلاؤڈ MongoDB Atlas سے منسلک ہو رہا ہے...';
      }
    }
  }catch{storageBlocked=true;storageReadFailed=true;alert('محفوظ ڈیٹا نہیں کھل سکا۔ اصل ڈیٹا محفوظ رکھا گیا ہے؛ دوبارہ کھولیں یا درست بیک اپ استعمال کریں۔');}
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

  // The rest of the file remains unchanged.
})();
