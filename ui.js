(() => {
  const icons={add:'M12 5v14M5 12h14',print:'M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z',file:'M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h8',grid:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',chart:'M4 3v18h17M8 17v-5M13 17V8M18 17V4',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4',folder:'M3 5h7l2 3h9v13H3z',download:'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',reset:'M3 10a9 9 0 1 1 1 8M3 3v7h7',calendar:'M3 5h18v16H3zM7 3v4M17 3v4M3 10h18',search:'M21 21l-5-5M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14',image:'M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M15 7h.01',copy:'M9 9h11v11H9zM5 15H4V4h11v1',shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',moon:'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',sun:'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'};
  function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.classList.add('ui-icon');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',icons[name]);svg.append(p);return svg;}
  const buttons={add:['add','نئی قطار'],print:['print','پرنٹ'], 'save-pdf':['file','PDF محفوظ کریں'],'open-pdf':['file','PDF کھولیں'],'open-pdf-folder':['folder','فولڈر'],'export-open':['grid','Excel'],'summary-open':['chart','خلاصہ'],'manage-branches':['people','پارٹیاں سنبھالیں'],'manage-backups':['shield','خودکار بیک اَپ'],'backup':['download','بیک اَپ ڈاؤن لوڈ'],'restore':['folder','بیک اَپ بحال کریں'],'auto-backup':['file','نئی پی سی ڈسک فائل بنائیں'],'link-disk-file':['folder','موجودہ پی سی فائل جوڑیں'],'reset-filters':['reset','فلٹر صاف کریں'],'add-party-tab':['add','نئی پارٹی'],'toggle-range':['calendar','دورانیہ فلٹر'],'receipt-preview':['print','رسید پرنٹ کریں'],'receipt-save':['file','PDF محفوظ کریں'],'receipt-png':['image','PNG محفوظ کریں (1:1)'],'receipt-copy':['copy','تصویر کاپی کریں'],'summary-pdf':['file','PDF محفوظ کریں'],'summary-png':['image','PNG محفوظ کریں']};
  for(const [id,[name,label]] of Object.entries(buttons)){const el=document.getElementById(id);if(!el)continue;const content=document.createElement('span');content.className='button-content';content.append(icon(name),document.createTextNode(label));el.replaceChildren(content);}
  const search=document.querySelector('.search-icon');if(search)search.replaceChildren(icon('search'));
  document.getElementById('search').setAttribute('aria-label','نام، موبائل یا مقام تلاش کریں');
  document.getElementById('manage-parties-tab').setAttribute('aria-label','پارٹیاں سنبھالیں');
  const more=document.querySelector('.more-menu');
  document.addEventListener('click',e=>{if(!more.contains(e.target))more.open=false;});
  more.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('.font-tools'))more.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&more.open){more.open=false;more.querySelector('summary').focus();}});
  if(!('closedBy' in HTMLDialogElement.prototype)){
    document.querySelectorAll('dialog').forEach(d=>{
      d.addEventListener('click',e=>{
        if(e.target!==d)return;
        const rect=d.getBoundingClientRect();
        if(rect.top<=e.clientY&&e.clientY<=rect.top+rect.height&&rect.left<=e.clientX&&e.clientX<=rect.left+rect.width)return;
        d.close();
      });
    });
  }
  document.querySelectorAll('.dialog-head button').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));

  // ===================== Theme Management (Dark / Light Mode) =====================
  function updateThemeUI(theme) {
    const isDark = theme === 'dark';
    const toggleBtn = document.getElementById('theme-toggle');
    const menuBtn = document.getElementById('menu-theme-toggle');
    if (toggleBtn) {
      const content = document.createElement('span');
      content.className = 'button-content';
      content.append(icon(isDark ? 'sun' : 'moon'), document.createTextNode(isDark ? 'ڈے موڈ' : 'نائٹ موڈ'));
      toggleBtn.replaceChildren(content);
      toggleBtn.title = isDark ? 'ڈے موڈ تبدیل کریں (Alt+T)' : 'نائٹ موڈ تبدیل کریں (Alt+T)';
      toggleBtn.setAttribute('aria-label', toggleBtn.title);
    }
    if (menuBtn) {
      const content = document.createElement('span');
      content.className = 'button-content';
      content.append(icon(isDark ? 'sun' : 'moon'), document.createTextNode(isDark ? '☀️ ڈے موڈ (لائٹ تھیم)' : '🌙 نائٹ موڈ (ڈارک تھیم)'));
      menuBtn.replaceChildren(content);
    }
  }

  function applyTheme(theme, persist = true) {
    const target = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', target);
    const metaScheme = document.querySelector('meta[name="color-scheme"]');
    if (metaScheme) metaScheme.content = target;
    const metaThemeColor = document.getElementById('meta-theme-color');
    if (metaThemeColor) metaThemeColor.content = target === 'dark' ? '#0c1511' : '#105442';
    if (persist) {
      try {
        localStorage.setItem('hisaab-theme', target);
      } catch (_) {}
    }
    updateThemeUI(target);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
  }

  const initialTheme = document.documentElement.getAttribute('data-theme') ||
    (localStorage.getItem('hisaab-theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  applyTheme(initialTheme, false);

  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) toggleBtn.addEventListener('click', toggleTheme);

  const menuThemeBtn = document.getElementById('menu-theme-toggle');
  if (menuThemeBtn) menuThemeBtn.addEventListener('click', toggleTheme);

  window.addEventListener('storage', e => {
    if (e.key === 'hisaab-theme' && (e.newValue === 'dark' || e.newValue === 'light')) {
      applyTheme(e.newValue, false);
    }
  });

  window.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      toggleTheme();
    }
  });
})();

// Arrange existing controls without duplicating their event handlers or accounting state.
(() => {
  const header=document.querySelector('.top-nav');
  const first=document.createElement('div');first.className='workspace-header';
  const tools=document.createElement('div');tools.className='workspace-tools';
  first.append(document.querySelector('.brand-mini'),document.querySelector('.workspace-nav'),document.querySelector('#theme-toggle'),document.querySelector('#save-state'),document.querySelector('.more-menu'));
  tools.append(document.querySelector('.top-nav-start'),document.querySelector('.top-nav-center'),document.querySelector('.top-nav-end'));
  header.append(first,tools);
  const output=document.createElement('details');output.className='output-menu';
  const trigger=document.createElement('summary');trigger.className='btn-nav';trigger.textContent='پرنٹ / ایکسپورٹ ▾';
  const panel=document.createElement('div');panel.className='output-panel';
  for(const id of ['print','save-pdf','open-pdf','open-pdf-folder','export-open'])panel.append(document.getElementById(id));
  output.append(trigger,panel);document.querySelector('.top-nav-end').prepend(output);
  document.addEventListener('click',e=>{if(!output.contains(e.target))output.open=false;});
  panel.addEventListener('click',e=>{if(e.target.closest('button'))output.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&output.open){output.open=false;trigger.focus();}});
  const strip=document.createElement('section');strip.className='register-summary no-print';strip.setAttribute('aria-label','منتخب اندراجات کا مجموعہ');
  for(const [id,label] of [['total-orders-count','آرڈرز'],['total-balance','بقایا'],['total-aed','درہم'],['total-pkr','روپیہ'],['total-net-aed','موجودہ درہم']]){
    const card=document.createElement('div'),caption=document.createElement('span'),value=document.createElement('strong');caption.textContent=label;
    const source=document.getElementById(id);const sync=()=>{value.textContent=source.textContent.replace(/^[^:]*:\s*/,'');};sync();new MutationObserver(sync).observe(source,{subtree:true,childList:true,characterData:true});
    card.append(caption,value);strip.append(card);
  }
  document.querySelector('#register-page .table-wrap').after(strip);
})();

(() => {
  const warning=document.getElementById('duplicate-warning-text');
  if(warning){const details=document.createElement('details');details.className='warning-details';const title=document.createElement('summary');title.textContent='ممکنہ دہرے اندراجات — تفصیل دیکھیں';warning.before(details);details.append(title,warning);}
})();
