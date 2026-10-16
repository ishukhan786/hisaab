(() => {
  'use strict';
  const digits=v=>String(v).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/٬/g,',');
  const amount=v=>{const s=digits(v).replace(/[,\s]/g,'');return !s?0n:/^\d{1,12}$/.test(s)?BigInt(s):null;};
  const format=n=>n.toLocaleString('en-IN');
  const hasData=r=>[r.detail,r.debit,r.credit].some(v=>v.trim());
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  function normalize(raw,fallback){
    if(raw===undefined)return {date:fallback,rows:[]};
    if(!raw||!validDate(raw.date)||!Array.isArray(raw.rows)||raw.rows.length>10001)throw Error('Invalid journal');
    const ids=new Set();
    return {date:raw.date,rows:raw.rows.map(r=>{
      if(!r||!validDate(r.date)||typeof r.detail!=='string'||r.detail.length>2000||['debit','credit'].some(k=>typeof r[k]!=='string'||r[k].length>40))throw Error('Invalid journal entry');
      const id=typeof r.id==='string'&&r.id.length<100&&!ids.has(r.id)?r.id:crypto.randomUUID();ids.add(id);
      const result={id,date:r.date,detail:r.detail};
      for(const k of ['debit','credit']){const v=digits(r[k]),n=amount(v);result[k]=v.trim()&&n!==null?format(n):v;}
      return result;
    }).filter(hasData)};
  }
  function mount({getState,save,today,exportSheet}){
    const $=id=>document.getElementById(id),nodes=new Map();let undo=null;
    const data=()=>getState().journal;
    const active=()=>document.body.classList.contains('journal-view');
    const selected=()=>data().rows.filter(r=>r.date===data().date&&hasData(r));
    const dateLabel=s=>s.split('-').reverse().join('/');
    function ensureDraft(){let draft=data().rows.find(r=>r.date===data().date&&!hasData(r));if(!draft){draft={id:crypto.randomUUID(),date:data().date,detail:'',debit:'',credit:''};data().rows.push(draft);}return draft;}
    function recalculate(){
      let opening=0n,valid=true,debit=0n,credit=0n,dayValid=true,serial=1;
      for(const r of data().rows.filter(r=>hasData(r)&&r.date<data().date)){const d=amount(r.debit),c=amount(r.credit);if(d===null||c===null)valid=false;else opening+=c-d;}
      $('journal-opening').textContent=valid?format(opening):'رقم درست کریں';let balance=opening;
      for(const r of data().rows.filter(r=>r.date===data().date)){
        const d=amount(r.debit),c=amount(r.credit),tr=nodes.get(r.id);if(!tr)continue;
        const populated=hasData(r);
        tr.classList.toggle('journal-draft',!populated);
        const sCell=tr.querySelector('.journal-serial');
        if(sCell)sCell.textContent=populated?String(serial++):'＋';
        for(const k of ['debit','credit']){const input=tr.querySelector('[data-journal="'+k+'"]');input.setCustomValidity(amount(r[k])===null?'صرف مثبت مکمل رقم لکھیں':'');input.setAttribute('aria-invalid',String(amount(r[k])===null));}
        if(d===null||c===null){valid=false;dayValid=false;}else{balance+=c-d;debit+=d;credit+=c;}
        tr.querySelector('.journal-balance').textContent=populated?(valid?format(balance):'—'):'';
      }
      $('journal-total-debit').textContent=dayValid?format(debit):'—';$('journal-total-credit').textContent=dayValid?format(credit):'—';$('journal-closing').textContent=valid?format(balance):'—';
      $('journal-message').textContent=valid?'بقایا = پچھلا بقایا + جمع − بنام':'رقم درست کریں؛ غلط رقم کی وجہ سے بقایا کا حساب مکمل نہیں ہے۔';$('journal-message').classList.toggle('error',!valid);
      $('journal-count').textContent=selected().length+' اندراجات';$('journal-date-print').textContent=dateLabel(data().date);
      $('journal-undo').hidden=!undo;
      return valid;
    }
    function addNode(r){
      const tr=document.createElement('tr');tr.dataset.journalId=r.id;nodes.set(r.id,tr);
      const sTd=document.createElement('td');sTd.className='journal-serial number';tr.append(sTd);
      for(const key of ['detail','debit','credit']){
        const td=document.createElement('td');const input=document.createElement(key==='detail'?'textarea':'input');input.dataset.journal=key;input.value=r[key];input.setAttribute('aria-label',key==='detail'?'تفصیل':key==='debit'?'بنام':'جمع');input.autocomplete='off';
        if(key==='detail'){input.rows=1;input.maxLength=2000;input.placeholder='تفصیل لکھیں…';}else{input.inputMode='numeric';input.className='journal-money';input.maxLength=30;input.placeholder='0';}
        input.addEventListener('input',e=>{if(e.isComposing)return;if(key!=='detail')input.value=digits(input.value);r[key]=input.value;const draft=ensureDraft();if(!nodes.has(draft.id))addNode(draft);recalculate();save();});
        input.addEventListener('compositionend',()=>input.dispatchEvent(new Event('input')));
        input.addEventListener('blur',()=>{if(key!=='detail'&&input.value.trim()&&amount(input.value)!==null){input.value=format(amount(input.value));r[key]=input.value;save();}});
        input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();input.blur();}if(e.key==='Tab'&&!e.shiftKey&&key==='credit'){e.preventDefault();input.blur();const rows=data().rows.filter(x=>x.date===data().date),next=rows[rows.indexOf(r)+1]||ensureDraft();if(!nodes.has(next.id))addNode(next);nodes.get(next.id).querySelector('textarea').focus();}});
        td.append(input);
        if(key==='detail'){td.className='journal-description';const remove=document.createElement('button');remove.className='journal-delete no-print';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','روزنامچہ انٹری حذف کریں');remove.onclick=()=>{if(hasData(r)){undo={row:structuredClone(r),index:data().rows.indexOf(r)};}data().rows=data().rows.filter(x=>x.id!==r.id);refresh();save();};td.append(remove);}
        tr.append(td);
      }
      const balance=document.createElement('td');balance.className='journal-balance';tr.append(balance);$('journal-rows').append(tr);
    }
    function refresh(){if(!data())getState().journal={date:today(),rows:[]};$('journal-date').value=data().date;ensureDraft();nodes.clear();$('journal-rows').replaceChildren();data().rows.filter(r=>r.date===data().date).forEach(addNode);recalculate();}
    function setPage(journal){document.body.classList.toggle('journal-view',journal);$('register-page').hidden=journal;$('journal-page').hidden=!journal;$('range-drawer').hidden=true;for(const [id,sel] of [['view-register',!journal],['view-journal',journal]]){$(id).setAttribute('aria-pressed',String(sel));$(id).classList.toggle('active',sel);}if(journal)refresh();try{localStorage.setItem('hisaab-workspace',journal?'journal':'register');}catch{}}
    $('view-register').onclick=()=>setPage(false);$('view-journal').onclick=()=>setPage(true);
    $('journal-date').onchange=()=>{if(!validDate($('journal-date').value)){$('journal-date').value=data().date;return;}data().date=$('journal-date').value;refresh();save();};
    function add(){const row=ensureDraft();if(!nodes.has(row.id))addNode(row);nodes.get(row.id).querySelector('textarea').focus();}
    $('journal-add').onclick=add;
    $('journal-undo').onclick=()=>{if(!undo)return;data().rows.splice(Math.min(undo.index,data().rows.length),0,undo.row);data().date=undo.row.date;undo=null;refresh();save();};
    function preparePrint(){recalculate();document.querySelectorAll('.journal-print-value').forEach(n=>n.remove());for(const tr of nodes.values())tr.querySelectorAll('input,textarea').forEach(input=>{const span=document.createElement('span');span.className='journal-print-value'+(input.dataset.journal==='detail'?'':' journal-money');span.textContent=input.value;input.after(span);});}
    async function output(pdf=false){if(!selected().length){alert('اس تاریخ پر کوئی انٹری موجود نہیں ہے۔');return;}if(!recalculate()){alert('پرنٹ سے پہلے روزنامچے کی رقم درست کریں۔');return;}await document.fonts.ready;preparePrint();if(!window.electronAPI?.previewPDF){window.print();return;}if(document.body.inert)return;document.body.inert=true;try{const result=pdf?await window.electronAPI.savePDF('روزنامچہ_'+data().date+'.pdf'):await window.electronAPI.previewPDF();if(result.status==='error')alert('روزنامچہ محفوظ یا پرنٹ نہیں ہو سکا۔ دوبارہ کوشش کریں۔');return result;}catch{alert('روزنامچہ محفوظ یا پرنٹ نہیں ہو سکا۔ دوبارہ کوشش کریں۔');}finally{document.body.inert=false;}}
    function exportExcel(){
      if(!selected().length||!recalculate()){alert('ایکسپورٹ کے لیے درست انٹریاں منتخب کریں۔');return;}
      const num=text=>({number:text.replace(/,/g,'')});
      const rows=[['سریل نمبر','تفصیل','بنام','جمع','بقایا'],['','پچھلا بقایا','','',num($('journal-opening').textContent)],...selected().map((r,i)=>[i+1,r.detail,{number:String(amount(r.debit))},{number:String(amount(r.credit))},num(nodes.get(r.id).querySelector('.journal-balance').textContent)]),['','کل حساب / آخری بقایا',num($('journal-total-debit').textContent),num($('journal-total-credit').textContent),num($('journal-closing').textContent)]];
      exportSheet(rows,'روزنامچہ_'+data().date+'.xlsx');
    }
    refresh();try{if(localStorage.getItem('hisaab-workspace')==='journal')setPage(true);}catch{}
    return {isActive:active,refresh,reset:()=>{undo=null;refresh();},add,preparePrint,output,exportExcel};
  }
  window.HisaabJournal={normalize,mount};
})();
