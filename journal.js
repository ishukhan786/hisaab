(() => {
  'use strict';
  const digits=v=>String(v).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/٬/g,',');
  const formatAllah=v=>String(v).replace(/(^|[\s\u060C\u06D4()\-]|\u0639\u0628\u062F|\u0621)\u0627\u0644\u0644[\u0651\u0670]*[\u06C1\u0647](?=$|[\s\u060C\u06D4()\-])/g,'$1\uFDF2');
  const amount=v=>{const s=digits(v).replace(/[,\s]/g,'');return !s?0n:/^\d{1,12}$/.test(s)?BigInt(s):null;};
  const format=n=>n.toLocaleString('en-IN');
  const hasData=r=>[r.detail,r.debit,r.credit].some(v=>v.trim());
  const validDate=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
  function normalize(raw,fallback){
    if(raw===undefined)return {date:fallback,rows:[]};
    if(!raw||!validDate(raw.date)||!Array.isArray(raw.rows)||raw.rows.length>10001)throw Error('Invalid journal');
    const cashCounts={};
    if(raw.cashCounts!==undefined){
      if(!raw.cashCounts||typeof raw.cashCounts!=='object'||Array.isArray(raw.cashCounts)||Object.keys(raw.cashCounts).length>10000)throw Error('Invalid cash counts');
      for(const [date,value] of Object.entries(raw.cashCounts)){
        if(!validDate(date)||typeof value!=='string'||value.length>40)throw Error('Invalid cash count');
        const v=digits(value),n=amount(v);
        if(v.trim())cashCounts[date]=n===null?v:format(n);
      }
    }
    const ids=new Set();
    return {date:raw.date,cashCounts,rows:raw.rows.map(r=>{
      if(!r||!validDate(r.date)||typeof r.detail!=='string'||r.detail.length>2000||['debit','credit'].some(k=>typeof r[k]!=='string'||r[k].length>40))throw Error('Invalid journal entry');
      const id=typeof r.id==='string'&&r.id.length<100&&!ids.has(r.id)?r.id:crypto.randomUUID();ids.add(id);
      const result={id,date:r.date,detail:formatAllah(r.detail)};
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
    function renderBalance(el,val,valid,invalidText='—'){
      el.classList.remove('is-jama','is-banam');el.replaceChildren();
      if(!valid){el.textContent=invalidText;return;}
      const abs=val<0n?-val:val,numSpan=document.createElement('span');
      numSpan.className='bal-num';numSpan.textContent=format(abs);el.append(numSpan);
      if(val!==0n){
        const isJama=val>0n;el.classList.add(isJama?'is-jama':'is-banam');
        const tag=document.createElement('span');tag.className='bal-tag';tag.textContent=isJama?'جمع':'بنام';
        el.append(' ',tag);
      }
    }
    const fmtBalText=b=>b>0n?`${format(b)} جمع`:b<0n?`${format(-b)} بنام`:'0';
    function openingBalance(){
      const date=data().date,counts=data().cashCounts||{};
      const last=Object.keys(counts).filter(d=>d<date&&counts[d].trim()).sort().at(-1);
      let value=last?amount(counts[last]):0n,valid=value!==null;
      if(value===null)value=0n;
      for(const r of data().rows){
        if(!hasData(r)||r.date>=date||(last&&r.date<=last))continue;
        const debit=amount(r.debit),credit=amount(r.credit);
        if(debit===null||credit===null)valid=false;else value+=credit-debit;
      }
      return {value,valid,source:last};
    }
    function recalculate(){
      const prior=openingBalance(),opening=prior.value;
      let valid=prior.valid,debit=0n,credit=0n,dayValid=true,serial=1;
      $('journal-opening').title=prior.source?'موجودہ نقد بیلنس ('+dateLabel(prior.source)+') اور اس کے بعد کی انٹریوں سے':'پچھلی انٹریوں کے حساب سے؛ موجودہ نقد بیلنس ابھی درج نہیں ہوئی';
      const openingValid=valid;
      renderBalance($('journal-opening'),opening,valid,'رقم درست کریں');let balance=opening;
      for(const r of data().rows.filter(r=>r.date===data().date)){
        const d=amount(r.debit),c=amount(r.credit),tr=nodes.get(r.id);if(!tr)continue;
        const populated=hasData(r);
        tr.classList.toggle('journal-draft',!populated);
        const sCell=tr.querySelector('.journal-serial');
        if(sCell)sCell.textContent=populated?String(serial++):'＋';
        for(const k of ['debit','credit']){const input=tr.querySelector('[data-journal="'+k+'"]');input.setCustomValidity(amount(r[k])===null?'صرف مثبت مکمل رقم لکھیں':'');input.setAttribute('aria-invalid',String(amount(r[k])===null));}
        if(d===null||c===null){valid=false;dayValid=false;}else{balance+=c-d;debit+=d;credit+=c;}
        const balCell=tr.querySelector('.journal-balance');
        if(!populated){balCell.classList.remove('is-jama','is-banam');balCell.replaceChildren();}
        else renderBalance(balCell,balance,valid,'—');
      }
      $('journal-total-debit').textContent=dayValid?format(debit):'—';$('journal-total-credit').textContent=dayValid?format(credit):'—';
      renderBalance($('journal-closing'),balance,valid,'—');
      $('journal-message').textContent=valid?'بقایا = پچھلا بقایا + جمع − بنام':'رقم درست کریں؛ غلط رقم کی وجہ سے بقایا کا حساب مکمل نہیں ہے۔';$('journal-message').classList.toggle('error',!valid);
      $('cash-opening').textContent=openingValid?format(opening):'—';
      $('cash-credit').textContent=dayValid?format(credit):'—';
      $('cash-debit').textContent=dayValid?format(debit):'—';
      $('cash-expected').textContent=valid?format(balance):'—';
      const cashInput=$('journal-cash-count'),raw=data().cashCounts?.[data().date]||'',count=amount(raw),entered=!!raw.trim();
      cashInput.setAttribute('aria-invalid',String(count===null));
      cashInput.setCustomValidity(count===null?'صرف مثبت مکمل رقم لکھیں':'');
      $('cash-count-print').textContent=entered?(count===null?'رقم درست کریں':format(count)):'درج نہیں کیا';
      const difference=$('cash-difference');difference.classList.remove('cash-short','cash-extra','cash-equal');
      if(!valid||count===null)difference.textContent='رقم درست کریں';
      else if(!entered)difference.textContent='موجودہ نقد بیلنس درج کریں';
      else {
        const delta=count-balance;
        difference.classList.add(delta<0n?'cash-short':delta>0n?'cash-extra':'cash-equal');
        difference.textContent=delta===0n?'حساب برابر ✓':format(delta<0n?-delta:delta)+(delta<0n?' کم ہے':' زیادہ ہے');
      }
      $('journal-count').textContent=selected().length+' اندراجات';$('journal-date-print').textContent=dateLabel(data().date);
      $('journal-undo').hidden=!undo;
      return valid&&count!==null;
    }
    function addNode(r, container = null){
      const tr=document.createElement('tr');tr.dataset.journalId=r.id;nodes.set(r.id,tr);
      const sTd=document.createElement('td');sTd.className='journal-serial number';tr.append(sTd);
      for(const key of ['detail','debit','credit']){
        const td=document.createElement('td');const input=document.createElement(key==='detail'?'textarea':'input');input.dataset.journal=key;input.value=r[key];input.setAttribute('aria-label',key==='detail'?'تفصیل':key==='debit'?'بنام':'جمع');input.autocomplete='off';
        if(key==='detail'){input.rows=1;input.maxLength=2000;input.placeholder='تفصیل لکھیں…';}else{input.inputMode='numeric';input.className='journal-money';input.maxLength=30;input.placeholder='0';}
        input.addEventListener('input',e=>{if(e.isComposing)return;if(key!=='detail')input.value=digits(input.value);else{const v=formatAllah(input.value);if(v!==input.value){const pos=input.selectionStart,diff=v.length-input.value.length;input.value=v;if(pos!==null){const np=Math.max(0,pos+diff);input.setSelectionRange(np,np);}}}r[key]=input.value;const draft=ensureDraft();if(!nodes.has(draft.id))addNode(draft);recalculate();save();});
        input.addEventListener('paste', e => {
          const pasteData = (e.clipboardData || window.clipboardData)?.getData('text');
          if (pasteData === undefined || pasteData === null) return;
          e.preventDefault();
          let cleaned = pasteData.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          if (key === 'detail') {
            cleaned = formatAllah(cleaned.trim().replace(/\n+/g, ' '));
          } else {
            cleaned = digits(cleaned.trim()).replace(/[^\d.-]/g, '');
          }
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          input.value = input.value.slice(0, start) + cleaned + input.value.slice(end);
          const nextPos = start + cleaned.length;
          if (typeof input.setSelectionRange === 'function') input.setSelectionRange(nextPos, nextPos);
          r[key] = input.value;
          const draft = ensureDraft();
          if (!nodes.has(draft.id)) addNode(draft);
          recalculate();
          save();
        });
        input.addEventListener('compositionend',()=>input.dispatchEvent(new Event('input')));
        input.addEventListener('blur',()=>{if(key!=='detail'&&input.value.trim()&&amount(input.value)!==null){input.value=format(amount(input.value));r[key]=input.value;}save(true);});
        input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();input.blur();}if(e.key==='Tab'&&!e.shiftKey&&key==='credit'){e.preventDefault();input.blur();const rows=data().rows.filter(x=>x.date===data().date),next=rows[rows.indexOf(r)+1]||ensureDraft();if(!nodes.has(next.id))addNode(next);nodes.get(next.id).querySelector('textarea').focus();}});
        td.append(input);
        if(key==='detail'){
          td.className='journal-description';
          const remove=document.createElement('button');
          remove.className='journal-delete no-print';
          remove.type='button';
          remove.textContent='×';
          remove.setAttribute('aria-label','روزنامچہ انٹری حذف کریں');
          remove.onclick=()=>{
            if(hasData(r)){
              if(typeof confirm==='function'&&!confirm('کیا آپ واقعی روزنامچہ کی یہ انٹری حذف کرنا چاہتے ہیں؟'))return;
              undo={row:structuredClone(r),index:data().rows.indexOf(r)};
            }
            data().rows=data().rows.filter(x=>x.id!==r.id);
            refresh();
            save(true);
          };
          td.append(remove);
        }
        tr.append(td);
      }
      const balance=document.createElement('td');balance.className='journal-balance';tr.append(balance);(container||$('journal-rows')).append(tr);
    }
    function refresh(){if(!data())getState().journal={date:today(),rows:[]};$('journal-date').value=data().date;$('journal-cash-count').value=data().cashCounts?.[data().date]||'';ensureDraft();nodes.clear();$('journal-rows').replaceChildren();const fragment=document.createDocumentFragment();data().rows.filter(r=>r.date===data().date).forEach(r=>addNode(r,fragment));$('journal-rows').append(fragment);recalculate();}
    function setPage(journal){document.body.classList.toggle('journal-view',journal);document.body.classList.remove('khata-view');$('register-page').hidden=journal;$('journal-page').hidden=!journal;const khataPage=$('khata-page');if(khataPage)khataPage.hidden=true;const viewKhata=$('view-khata');if(viewKhata){viewKhata.setAttribute('aria-pressed','false');viewKhata.setAttribute('aria-selected','false');viewKhata.classList.remove('active');}$('range-drawer').hidden=true;for(const [id,sel] of [['view-register',!journal],['view-journal',journal]]){$(id).setAttribute('aria-pressed',String(sel));$(id).setAttribute('aria-selected',String(sel));$(id).classList.toggle('active',sel);}if(journal){if(data())data().date=today();refresh();}try{localStorage.setItem('hisaab-workspace',journal?'journal':'register');}catch{}}
    $('journal-cash-count').addEventListener('input',e=>{
      const input=e.target;input.value=digits(input.value);
      data().cashCounts??={};
      if(input.value.trim())data().cashCounts[data().date]=input.value;
      else delete data().cashCounts[data().date];
      recalculate();save();
    });
    $('journal-cash-count').addEventListener('blur',e=>{
      const n=amount(e.target.value);
      if(e.target.value.trim()&&n!==null){e.target.value=format(n);data().cashCounts[data().date]=e.target.value;recalculate();}
      save(true);
    });
    $('view-register').onclick=()=>{setPage(false);if(window.setWorkingDate)window.setWorkingDate(today());};$('view-journal').onclick=()=>setPage(true);
    $('journal-date').onchange=()=>{if(!validDate($('journal-date').value)){$('journal-date').value=data().date;return;}data().date=$('journal-date').value;refresh();save(true);};
    function shiftDate(days){
      const current=data().date,date=new Date(current+'T12:00:00Z');
      date.setUTCDate(date.getUTCDate()+days);
      const next=date.toISOString().slice(0,10),input=$('journal-date');
      if(!validDate(next)||(input.min&&next<input.min)||(input.max&&next>input.max))return;
      input.value=next;input.dispatchEvent(new Event('change'));
    }
    $('journal-date-prev').onclick=()=>shiftDate(-1);
    $('journal-date-next').onclick=()=>shiftDate(1);
    function add(){const row=ensureDraft();if(!nodes.has(row.id))addNode(row);nodes.get(row.id).querySelector('textarea').focus();}
    $('journal-undo').onclick=()=>{if(!undo)return;data().rows.splice(Math.min(undo.index,data().rows.length),0,undo.row);data().date=undo.row.date;undo=null;refresh();save(true);};
    function preparePrint(){recalculate();document.querySelectorAll('.journal-print-value').forEach(n=>n.remove());for(const tr of nodes.values())tr.querySelectorAll('input,textarea').forEach(input=>{const span=document.createElement('span');span.className='journal-print-value'+(input.dataset.journal==='detail'?'':' journal-money');span.textContent=input.value;input.after(span);});}
    async function output(pdf=false){if(!selected().length&&!data().cashCounts?.[data().date]?.trim()){alert('اس تاریخ پر کوئی انٹری موجود نہیں ہے۔');return;}if(!recalculate()){alert('پرنٹ سے پہلے روزنامچے کی رقم درست کریں۔');return;}await document.fonts.ready;preparePrint();const restoreTheme=window.prepareForPrintTheme?window.prepareForPrintTheme():null;if(!window.electronAPI?.previewPDF){try{window.print();}finally{restoreTheme?.();}return;}if(document.body.inert){restoreTheme?.();return;}document.body.inert=true;try{const result=pdf?await window.electronAPI.savePDF('روزنامچہ_'+data().date+'.pdf', { landscape: false }):await window.electronAPI.previewPDF({ landscape: false });if(result.status==='error')alert('روزنامچہ محفوظ یا پرنٹ نہیں ہو سکا۔ دوبارہ کوشش کریں۔');return result;}catch{alert('روزنامچہ محفوظ یا پرنٹ نہیں ہو سکا۔ دوبارہ کوشش کریں۔');}finally{document.body.inert=false;restoreTheme?.();}}
    function exportExcel(){
      if((!selected().length&&!data().cashCounts?.[data().date]?.trim())||!recalculate()){alert('ایکسپورٹ کے لیے درست انٹریاں منتخب کریں۔');return;}
      let bal=openingBalance().value,totD=0n,totC=0n;
      const openText=fmtBalText(bal);
      const entryRows=selected().map((r,i)=>{const d=amount(r.debit),c=amount(r.credit);bal+=c-d;totD+=d;totC+=c;return [i+1,r.detail,{number:String(d)},{number:String(c)},fmtBalText(bal)];});
      const rows=[['نمبر شمار','تفصیل','بنام','جمع','بقایا'],['','پچھلا بقایا','','',openText],...entryRows,['','کل حساب / آخری بقایا',{number:String(totD)},{number:String(totC)},fmtBalText(bal)]];
      rows.push([],['','روزانہ کیش خلاصہ'],['','سابقہ کیش','','',openText],['','ٹوٹل جمع','','',{number:String(totC)}],['','ٹوٹل بنام','','',{number:String(totD)}],['','حساب کے مطابق موجود ہونا چاہیے','','',{number:String(bal)}]);
      const raw=data().cashCounts?.[data().date]||'',count=amount(raw);
      rows.push(['','موجودہ نقد بیلنس','','',raw.trim()?{number:String(count)}:'درج نہیں کیا']);
      rows.push(['','فرق — کمی / زیادتی','','',$('cash-difference').textContent]);
      exportSheet(rows,'روزنامچہ_'+data().date+'.xlsx');
    }
    if(data())data().date=today();refresh();
    return {isActive:active,refresh,reset:()=>{undo=null;refresh();},add,preparePrint,output,exportExcel};
  }
  window.HisaabJournal={normalize,mount};
})();
