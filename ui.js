(() => {
  const icons={add:'M12 5v14M5 12h14',print:'M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z',file:'M14 2H5v20h14V7zM14 2v5h5M8 12h8M8 16h8',grid:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',chart:'M4 3v18h17M8 17v-5M13 17V8M18 17V4',people:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4',folder:'M3 5h7l2 3h9v13H3z',download:'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',reset:'M3 10a9 9 0 1 1 1 8M3 3v7h7',calendar:'M3 5h18v16H3zM7 3v4M17 3v4M3 10h18',search:'M21 21l-5-5M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14',image:'M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M15 7h.01',copy:'M9 9h11v11H9zM5 15H4V4h11v1',send:'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',shield:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',moon:'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',sun:'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z'};
  function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.classList.add('ui-icon');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',icons[name]);svg.append(p);return svg;}
  const buttons={add:['add','نئی قطار'],print:['print','پرنٹ'], 'save-pdf':['file','PDF محفوظ کریں'],'open-pdf':['file','PDF کھولیں'],'open-pdf-folder':['folder','فولڈر'],'export-open':['grid','Excel'],'summary-open':['chart','خلاصہ'],'manage-branches':['people','پارٹیاں سنبھالیں'],'manage-backups':['shield','خودکار بیک اَپ'],'backup':['download','بیک اَپ ڈاؤن لوڈ'],'restore':['folder','بیک اَپ بحال کریں'],'auto-backup':['file','نئی پی سی ڈسک فائل بنائیں'],'link-disk-file':['folder','موجودہ پی سی فائل جوڑیں'],'reset-filters':['reset','فلٹر صاف کریں'],'add-party-tab':['add','نئی پارٹی'],'toggle-range':['calendar','دورانیہ فلٹر'],'receipt-preview':['print','رسید پرنٹ کریں'],'receipt-save':['file','PDF محفوظ کریں'],'receipt-png':['image','PNG محفوظ کریں (1:1)'],'receipt-copy':['copy','تصویر کاپی کریں'],'receipt-whatsapp':['send','WhatsApp پر بھیجیں'],'summary-pdf':['file','PDF محفوظ کریں'],'summary-png':['image','PNG محفوظ کریں']};
  for(const [id,[name,label]] of Object.entries(buttons)){const el=document.getElementById(id);if(!el)continue;const content=document.createElement('span');content.className='button-content';content.append(icon(name),document.createTextNode(label));el.replaceChildren(content);}
  const search=document.querySelector('.search-icon');if(search)search.replaceChildren(icon('search'));
  const searchInput = document.getElementById('search');
  if (searchInput) searchInput.setAttribute('aria-label','نام، موبائل یا مقام تلاش کریں');
  const managePartiesTab = document.getElementById('manage-parties-tab');
  if (managePartiesTab) managePartiesTab.setAttribute('aria-label','پارٹیاں سنبھالیں');
  const more=document.querySelector('.more-menu');
  if (more) {
    const moreSummary=more.querySelector(':scope > summary');
    const morePanel=more.querySelector(':scope > .menu');
    function positionMoreMenu(){
      if(!more.open||!morePanel||!moreSummary)return;
      const anchor=moreSummary.getBoundingClientRect();
      const panelWidth=Math.min(Math.max(morePanel.offsetWidth,295),window.innerWidth-24);
      const left=Math.max(12,Math.min(anchor.left,window.innerWidth-panelWidth-12));
      morePanel.style.setProperty('position','fixed','important');
      morePanel.style.setProperty('left',`${left}px`,'important');
      morePanel.style.setProperty('right','auto','important');
      morePanel.style.setProperty('top',`${Math.min(anchor.bottom+8,window.innerHeight-100)}px`,'important');
      morePanel.style.setProperty('bottom','auto','important');
      morePanel.style.setProperty('width',`${panelWidth}px`,'important');
      morePanel.style.setProperty('max-width',`${window.innerWidth-24}px`,'important');
      morePanel.style.setProperty('z-index','2000','important');
      morePanel.style.setProperty('max-height',`${Math.max(160,window.innerHeight-anchor.bottom-24)}px`,'important');
    }
    more.addEventListener('toggle',positionMoreMenu);
    window.addEventListener('resize',positionMoreMenu);
    window.addEventListener('scroll',positionMoreMenu,true);
    document.addEventListener('click',e=>{if(!more.contains(e.target))more.open=false;});
    more.addEventListener('click',e=>{if(e.target.closest('button')&&!e.target.closest('.font-tools'))more.open=false;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&more.open){more.open=false;more.querySelector('summary')?.focus();}});
  }
  let supportsDisplayTransition;
  function canTransitionDisplay() {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
      return false;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransition;
  }
  function supportsTopLayerExit() {
    return window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay();
  }
  async function closeTopLayer(element) {
    if (!element) return;
    if (!supportsTopLayerExit()) {
      element.setAttribute('data-closing', '');
      const animations = typeof element.getAnimations === 'function' ? element.getAnimations({ subtree: true }) : [];
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map(a => a.finished)),
          new Promise(r => setTimeout(r, 2000)),
        ]);
      }
      if (!element.hasAttribute('data-closing')) return;
      element.removeAttribute('data-closing');
    }
    element.close();
  }
  if(!('closedBy' in HTMLDialogElement.prototype)){
    document.querySelectorAll('dialog').forEach(d=>{
      d.addEventListener('click',e=>{
        if(e.target!==d)return;
        const rect=d.getBoundingClientRect();
        if(rect.top<=e.clientY&&e.clientY<=rect.top+rect.height&&rect.left<=e.clientX&&e.clientX<=rect.left+rect.width)return;
        closeTopLayer(d);
      });
    });
  }
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('cancel', e => {
      e.preventDefault();
      closeTopLayer(d);
    });
  });
  document.querySelectorAll('.dialog-head button').forEach(button=>button.addEventListener('click',()=>closeTopLayer(button.closest('dialog'))));

  // ===================== Theme Management (Dark / Light Mode) =====================
  function updateThemeUI(theme) {
    const isDark = theme === 'dark';
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      const content = document.createElement('span');
      content.className = 'button-content';
      content.append(icon(isDark ? 'sun' : 'moon'));
      toggleBtn.replaceChildren(content);
      toggleBtn.title = isDark ? 'ڈے موڈ تبدیل کریں (Alt+T)' : 'نائٹ موڈ تبدیل کریں (Alt+T)';
      toggleBtn.setAttribute('aria-label', toggleBtn.title);
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
  first.append(...[document.querySelector('.brand-mini'),document.querySelector('.workspace-nav'),document.querySelector('#theme-toggle'),document.querySelector('#backup-error-pill'),document.querySelector('#save-state')].filter(Boolean));
  tools.append(document.querySelector('.top-nav-start'),document.querySelector('.top-nav-center'),document.querySelector('.top-nav-end'));
  header.append(first,tools);
  const summaryBtn=document.getElementById('summary-open');
  const moreMenu=document.querySelector('.more-menu');
  if(summaryBtn&&moreMenu)summaryBtn.after(moreMenu);
  const output=document.createElement('details');output.className='output-menu';
  const trigger=document.createElement('summary');trigger.className='btn-nav';trigger.textContent='پرنٹ / ایکسپورٹ ▾';
  const panel=document.createElement('div');panel.className='output-panel';
  for(const id of ['print','save-pdf','open-pdf','open-pdf-folder','export-open']){
    const btn=document.getElementById(id);
    if(btn)panel.append(btn);
  }
  output.append(trigger,panel);
  const endNav=document.querySelector('.top-nav-end');
  if(endNav)endNav.prepend(output);

  function positionOutputMenu(){
    if(!output.open||!panel||!trigger)return;
    if(window.innerWidth<=600){
      panel.style.removeProperty('left');
      panel.style.removeProperty('right');
      panel.style.removeProperty('top');
      panel.style.removeProperty('bottom');
      panel.style.removeProperty('width');
      panel.style.removeProperty('max-width');
      return;
    }
    const anchor=trigger.getBoundingClientRect();
    const panelWidth=Math.min(Math.max(panel.offsetWidth,230),window.innerWidth-24);
    const isRTL=document.dir==='rtl'||document.documentElement.dir==='rtl'||getComputedStyle(document.body).direction==='rtl';
    let left;
    if(isRTL){
      left=anchor.right-panelWidth;
    }else{
      left=anchor.left;
    }
    left=Math.max(12,Math.min(left,window.innerWidth-panelWidth-12));
    panel.style.setProperty('position','fixed','important');
    panel.style.setProperty('left',`${left}px`,'important');
    panel.style.setProperty('right','auto','important');
    panel.style.setProperty('top',`${Math.min(anchor.bottom+8,window.innerHeight-100)}px`,'important');
    panel.style.setProperty('bottom','auto','important');
    panel.style.setProperty('width',`${panelWidth}px`,'important');
    panel.style.setProperty('max-width',`${window.innerWidth-24}px`,'important');
    panel.style.setProperty('z-index','2000','important');
    panel.style.setProperty('max-height',`${Math.max(160,window.innerHeight-anchor.bottom-24)}px`,'important');
  }
  output.addEventListener('toggle',positionOutputMenu);
  output.addEventListener('click',e=>{
    if(e.target.closest('summary')){
      requestAnimationFrame(positionOutputMenu);
    }
  });
  window.addEventListener('resize',positionOutputMenu);
  window.addEventListener('scroll',positionOutputMenu,true);
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

(() => {
  const badge=document.getElementById('save-state');let pulse;
  document.addEventListener('hisaab:saved',()=>{
    pulse?.cancel();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    pulse=badge.animate([{boxShadow:'0 0 0 0 rgba(16,185,129,.45)'},{boxShadow:'0 0 0 8px rgba(16,185,129,.12)',offset:.45},{boxShadow:'0 0 0 12px rgba(16,185,129,0)'}],{duration:750,easing:'ease-out'});
  });
  new MutationObserver(()=>{if(!badge.textContent.trim().startsWith('✓'))pulse?.cancel();}).observe(badge,{childList:true,characterData:true,subtree:true});
  const hint=document.createElement('div');hint.className='entry-empty-hint no-print';
  const symbol=document.createElement('span');symbol.className='entry-empty-icon';symbol.textContent='✎';symbol.setAttribute('aria-hidden','true');
  const message=document.createElement('p');message.textContent='اس منظر میں کوئی اندراج نہیں۔ نیچے خالی قطار سے شروع کریں، یا تاریخ اور تلاش کا فلٹر چیک کریں۔';
  const resetHintBtn=document.createElement('button');resetHintBtn.type='button';resetHintBtn.className='empty-hint-reset-btn';resetHintBtn.textContent='🔄 فلٹر صاف کریں';
  resetHintBtn.onclick=()=>{document.getElementById('reset-filters')?.click();};
  hint.append(symbol,message,resetHintBtn);document.querySelector('#register-page .table-wrap').before(hint);
  const count=document.getElementById('count');const sync=()=>{hint.hidden=!/^0\s/.test(count.textContent);};
  new MutationObserver(sync).observe(count,{childList:true,characterData:true,subtree:true});sync();
})();

/* ==========================================================================
   QUICK JUMP COMMAND PALETTE (Ctrl+K) & KEYBOARD SHORTCUTS GUIDE (?)
   ========================================================================== */
(() => {
  const qDialog = document.getElementById('quick-jump-dialog');
  const qInput = document.getElementById('quick-jump-input');
  const qResults = document.getElementById('quick-jump-results');
  const qClose = document.getElementById('close-quick-jump');
  const qTrigger = document.getElementById('open-quick-jump');

  const sDialog = document.getElementById('shortcuts-dialog');
  const sClose = document.getElementById('close-shortcuts');
  const sBtnFooter = document.getElementById('btn-show-shortcuts');
  const sBtnMenu = document.getElementById('open-shortcuts-menu');

  let activeIdx = 0;
  let currentItems = [];

  function collectItems(query) {
    const q = String(query || '').trim().toLowerCase();
    const items = [];

    const workspaces = [
      { id: 'view-register', title: 'اندراج رجسٹر (Daily Register)', badge: 'صفحہ', icon: '📒' },
      { id: 'view-journal', title: 'روزنامچہ (Cashbook)', badge: 'صفحہ', icon: '📖' },
      { id: 'view-khata', title: 'کسٹمرز کھاتے (Customer Ledger)', badge: 'صفحہ', icon: '👥' }
    ];
    for (const w of workspaces) {
      items.push({
        icon: w.icon,
        title: w.title,
        sub: 'ورک اسپیس تبدیل کریں',
        badge: w.badge,
        run: () => document.getElementById(w.id)?.click()
      });
    }

    const partyTabs = Array.from(document.querySelectorAll('#party-tabs button'));
    for (const btn of partyTabs) {
      const name = btn.textContent.trim();
      if (!name) continue;
      items.push({
        icon: '🏢',
        title: name,
        sub: 'اندراج رجسٹر پارٹی ٹیب',
        badge: 'پارٹی',
        run: () => {
          document.getElementById('view-register')?.click();
          btn.click();
        }
      });
    }

    const khatas = Array.isArray(window.HisaabState?.khatas) ? window.HisaabState.khatas : [];
    for (const k of khatas) {
      items.push({
        icon: '👤',
        title: `${k.name} (${k.code})`,
        sub: [k.mobile, k.address].filter(Boolean).join(' • ') || 'کسٹمر کھاتہ کھولیں',
        badge: 'کھاتہ',
        run: () => {
          document.getElementById('view-khata')?.click();
          const searchEl = document.getElementById('khata-dir-search');
          if (searchEl) {
            searchEl.value = k.code || k.name;
            searchEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const rows = Array.from(document.querySelectorAll('#khata-dir-rows tr'));
          const match = rows.find(tr => tr.textContent.includes(k.code));
          if (match) match.click();
        }
      });
    }

    const actions = [
      { icon: '📋', title: 'روزانہ و ماہانہ خلاصہ رپورٹ', sub: 'Summary Report', badge: 'ایکشن', run: () => document.getElementById('summary-open')?.click() },
      { icon: '🛡️', title: 'خودکار بیک اَپ و ڈیٹا حفاظت', sub: 'Auto-Backup & USB/Cloud', badge: 'ایکشن', run: () => document.getElementById('manage-backups')?.click() },
      { icon: '🖨️', title: 'پرنٹ / PDF محفوظ کریں', sub: 'Ctrl+P', badge: 'ایکشن', run: () => document.getElementById('print')?.click() },
      { icon: '🌙', title: 'نائٹ / ڈے موڈ تبدیل کریں', sub: 'Alt+T', badge: 'ایکشن', run: () => document.getElementById('theme-toggle')?.click() },
      { icon: '🔑', title: 'لاگ ان اکاؤنٹ و پاس ورڈ سیٹنگز', sub: 'Account Settings', badge: 'ایکشن', run: () => document.getElementById('account-settings-btn')?.click() },
      { icon: '🔒', title: 'ابھی ایپ لاک کریں', sub: 'Ctrl+L', badge: 'ایکشن', run: () => document.getElementById('lock-app-now-btn')?.click() }
    ];
    items.push(...actions);

    if (!q) return items.slice(0, 14);
    return items.filter(it =>
      it.title.toLowerCase().includes(q) ||
      it.sub.toLowerCase().includes(q) ||
      it.badge.toLowerCase().includes(q)
    ).slice(0, 16);
  }

  function renderQuickJump() {
    if (!qResults) return;
    currentItems = collectItems(qInput?.value);
    activeIdx = 0;
    qResults.replaceChildren();
    if (!currentItems.length) {
      const empty = document.createElement('div');
      empty.className = 'quick-jump-empty';
      empty.textContent = 'کوئی مماثل کھاتہ، پارٹی یا ایکشن نہیں ملا۔';
      qResults.append(empty);
      return;
    }
    currentItems.forEach((item, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-jump-item' + (idx === 0 ? ' is-active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(idx === 0));

      const icon = document.createElement('span');
      icon.className = 'qj-icon';
      icon.textContent = item.icon;

      const textWrap = document.createElement('div');
      textWrap.className = 'qj-text';
      const title = document.createElement('strong');
      title.textContent = item.title;
      const sub = document.createElement('small');
      sub.textContent = item.sub;
      textWrap.append(title, sub);

      const badge = document.createElement('span');
      badge.className = 'qj-badge';
      badge.textContent = item.badge;

      btn.append(icon, textWrap, badge);
      btn.onclick = () => {
        qDialog?.close();
        item.run();
      };
      qResults.append(btn);
    });
  }

  function highlightActive() {
    if (!qResults) return;
    const nodes = Array.from(qResults.querySelectorAll('.quick-jump-item'));
    nodes.forEach((n, i) => {
      const sel = i === activeIdx;
      n.classList.toggle('is-active', sel);
      n.setAttribute('aria-selected', String(sel));
      if (sel) n.scrollIntoView({ block: 'nearest' });
    });
  }

  function openQuickJump() {
    if (!qDialog || document.body.inert) return;
    if (qInput) qInput.value = '';
    renderQuickJump();
    try { if (qDialog.open) qDialog.close(); } catch (_) {}
    qDialog.showModal();
    qInput?.focus();
  }

  function openShortcuts() {
    if (!sDialog || document.body.inert) return;
    const more = document.querySelector('.more-menu');
    if (more) more.open = false;
    try { if (sDialog.open) sDialog.close(); } catch (_) {}
    sDialog.showModal();
  }

  if (qTrigger) qTrigger.onclick = openQuickJump;
  if (qClose) qClose.onclick = () => qDialog?.close();
  if (qInput) {
    qInput.addEventListener('input', renderQuickJump);
    qInput.addEventListener('keydown', e => {
      if (!currentItems.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIdx = (activeIdx + 1) % currentItems.length;
        highlightActive();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIdx = (activeIdx - 1 + currentItems.length) % currentItems.length;
        highlightActive();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = currentItems[activeIdx];
        if (chosen) {
          qDialog?.close();
          chosen.run();
        }
      }
    });
  }

  if (sBtnFooter) sBtnFooter.onclick = openShortcuts;
  if (sBtnMenu) sBtnMenu.onclick = openShortcuts;
  if (sClose) sClose.onclick = () => sDialog?.close();

  window.addEventListener('keydown', e => {
    if (document.body.inert) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openQuickJump();
      return;
    }
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = document.activeElement?.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        openShortcuts();
      }
    }
  });
})();

/* ==========================================================================
   MODERN FLOATING TOAST NOTIFICATION SYSTEM (Option 5)
   ========================================================================== */
(() => {
  const container = document.getElementById('hisaab-toast-container');
  const icons = {
    success: '✓',
    info: 'ℹ️',
    warning: '⚠️',
    error: '✕'
  };

  function showToast(message, type = 'info', duration = 3200) {
    if (!container || !message) return;
    const toast = document.createElement('div');
    toast.className = `hisaab-toast toast-${type}`;
    toast.setAttribute('role', 'status');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'toast-icon';
    iconSpan.textContent = icons[type] || 'ℹ️';

    const textDiv = document.createElement('div');
    textDiv.className = 'toast-text';
    textDiv.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast-close';
    closeBtn.setAttribute('aria-label', 'بند کریں');
    closeBtn.textContent = '×';

    let timer = null;
    const dismiss = () => {
      if (timer) clearTimeout(timer);
      toast.classList.add('is-hiding');
      setTimeout(() => {
        toast.remove();
      }, 220);
    };

    closeBtn.onclick = dismiss;
    toast.append(iconSpan, textDiv, closeBtn);

    if (duration > 0) {
      const progressBar = document.createElement('div');
      progressBar.className = 'toast-progress-bar';
      progressBar.style.animationDuration = `${duration}ms`;
      toast.appendChild(progressBar);
      timer = setTimeout(dismiss, duration);
    }
    container.append(toast);
    return dismiss;
  }

  window.showToast = showToast;

  // Intercept save events for subtle non-intrusive notification
  let lastSaveToast = 0;
  document.addEventListener('hisaab:saved', () => {
    const now = Date.now();
    if (now - lastSaveToast > 15000) {
      lastSaveToast = now;
      showToast('ڈیٹا بیس میں محفوظ ہے ✓', 'success', 2200);
    }
  });

  // Action toasts for exports
  const exportBtn = document.getElementById('export-open');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      showToast('Excel ایکسپورٹ ڈائیلاگ کھل گیا', 'info', 2000);
    });
  }
})();
