/**
 * CHANGELOG - Refactoring & Bug Fixes:
 * A1: Support decimal money via minor units (BigInt paisa/fils), parseAmount, formatAmount, minorToDecimalString.
 * A2: Capture wasDraft before input mutation in detail, debit, and credit so transition to filled creates next draft.
 * A3: Prevent XSS in directory modal and throughout by replacing innerHTML with safe DOM construction.
 * B1: Removed redundant ensureDraft() call in delete row click handler.
 * B2: Enhanced ensureDraft(khata, { appendNode }) to create and immediately mount draft DOM node when requested.
 * B3: Hardened code uniqueness loop (base-1, base-2) and sanitized codes to [A-Z0-9\-_ ] max 40 chars.
 * B4: Passed fallbackDate to normalizeRow and used when row date is invalid.
 * B5: Highlighted malformed debit/credit values with is-invalid CSS class and injected style tag at mount.
 * B6: Enforced 12 integer digits and 2 decimal digits maximum cap in parseAmount.
 * B7: Added null guard at the beginning of hasData(r).
 * B8: Added uuid() helper with Date.now/Math.random fallback and replaced all crypto.randomUUID() calls.
 * B9: Implemented groupIN fallback for Indian numeral grouping in formatAmount and formatCount.
 * B10: Updated formatAllah regex with \u0648 (waw) boundary to match "واللہ" -> "وﷲ".
 * C1: Enter key in detail textarea jumps focus to next draft row when row is complete, otherwise blurs.
 * C2: Tab key from credit field focuses next draft row and scrolls it into view using scrollIntoView({ block: 'nearest' }).
 * C3: Validated date input in onchange with validDate; reverts to original r.date if invalid.
 * C4: Disabled edit, print, excel, and delete action buttons when no active khata exists.
 * C5: Guarded today() calls with local getToday() helper falling back to current ISO date.
 * C6: Extracted syncNavButtons helper and cleared stale journal-view class when switching views.
 * C7: Added concise JSDoc comments to all core functions.
 * C8: Preserved public API contracts and data shapes across normalize and mount.
 * C9: Maintained Persian/Arabic digit normalization in digits() helper.
 * C10: Pure vanilla JS implementation with zero external dependencies.
 */
(() => {
  'use strict';

  /**
   * Generates a unique identifier with standard fallback.
   * @returns {string}
   */
  const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

  /**
   * Normalizes Persian/Arabic numerals to ASCII 0-9 and separator ٬ to ,.
   * @param {string|number} v
   * @returns {string}
   */
  const digits = v => String(v)
    .replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/٬/g, ',');

  /**
   * Replaces occurrences of Allah with the Arabic ligature U+FDF2 with prefix preservation.
   * @param {string} v
   * @returns {string}
   */
  const formatAllah = v => String(v).replace(
    /(^|[\s\u060C\u06D4()\-]|عبد|ء|و|ب)الل[\u0651\u0670]*[ہه](?=$|[\s\u060C\u06D4()\-]|)/g,
    '$1\uFDF2'
  );

  /**
   * Formats numbers according to the Indian numeral grouping system.
   * @param {string|number} str
   * @returns {string}
   */
  function groupIN(str) {
    const s = String(str);
    if (s.length <= 3) return s;
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }

  /**
   * Parses user input string into BigInt minor units (paisa/fils).
   * Enforces up to 12 integer digits and up to 2 decimal digits in minor units.
   * @param {string|number|bigint} v
   * @returns {bigint|null}
   */
  function parseAmount(v) {
    if (v === null || v === undefined) return null;
    const s = digits(v).trim().replace(/[,\s٬]/g, '');
    if (!s || s.startsWith('-')) return null;
    const clean = s.startsWith('+') ? s.slice(1) : s;
    if (!clean) return null;
    const match = clean.match(/^(\d{1,12})(?:\.(\d{0,2}))?$/);
    if (!match) return null;
    const intPart = match[1];
    let fracPart = match[2] || '';
    if (fracPart.length === 1) fracPart += '0';
    else if (fracPart.length === 0) fracPart = '00';
    try {
      return BigInt(intPart) * 100n + BigInt(fracPart);
    } catch {
      return null;
    }
  }

  /**
   * Converts BigInt minor units to standard decimal string representation (e.g. "1234.50").
   * @param {bigint|number} bigintMinor
   * @returns {string}
   */
  function minorToDecimalString(bigintMinor) {
    if (bigintMinor === null || bigintMinor === undefined) return '0.00';
    let n;
    try {
      n = typeof bigintMinor === 'bigint' ? bigintMinor : BigInt(bigintMinor);
    } catch {
      return '0.00';
    }
    const isNeg = n < 0n;
    const absN = isNeg ? -n : n;
    const intVal = absN / 100n;
    const fracVal = absN % 100n;
    const fracStr = fracVal < 10n ? '0' + fracVal.toString() : fracVal.toString();
    return (isNeg ? '-' : '') + intVal.toString() + '.' + fracStr;
  }

  /**
   * Formats BigInt minor units to Indian grouping formatted display string.
   * @param {bigint|number} bigintMinor
   * @param {{ withDecimals?: boolean }} [options]
   * @returns {string}
   */
  function formatAmount(bigintMinor, { withDecimals = false } = {}) {
    if (bigintMinor === null || bigintMinor === undefined) return '0';
    let n;
    try {
      n = typeof bigintMinor === 'bigint' ? bigintMinor : BigInt(bigintMinor);
    } catch {
      return '0';
    }
    const isNeg = n < 0n;
    const absN = isNeg ? -n : n;
    const intVal = absN / 100n;
    const fracVal = absN % 100n;
    let intStr;
    try {
      intStr = intVal.toLocaleString('en-IN');
    } catch {
      intStr = groupIN(intVal.toString());
    }
    if (fracVal === 0n && !withDecimals) {
      return (isNeg ? '-' : '') + intStr;
    }
    const fracStr = fracVal < 10n ? '0' + fracVal.toString() : fracVal.toString();
    return (isNeg ? '-' : '') + intStr + '.' + fracStr;
  }

  /**
   * Formats non-money counts and serial numbers.
   * @param {number|string} n
   * @returns {string}
   */
  function formatCount(n) {
    if (n === null || n === undefined) return '0';
    try {
      return Number(n).toLocaleString('en-IN');
    } catch {
      return groupIN(String(n));
    }
  }

  /**
   * Checks whether a row contains user data.
   * @param {object} r
   * @returns {boolean}
   */
  const hasData = r => {
    if (!r) return false;
    return [r.detail, r.debit, r.credit].some(v => typeof v === 'string' && v.trim());
  };

  /**
   * Validates ISO date format YYYY-MM-DD.
   * @param {string} s
   * @returns {boolean}
   */
  const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

  /**
   * Normalizes an individual ledger row with fallback date and minor unit formatting.
   * @param {object} r
   * @param {string} [fallbackDate]
   * @returns {object|null}
   */
  function normalizeRow(r, fallbackDate) {
    if (!r) return null;
    const id = typeof r.id === 'string' && r.id.length < 100 ? r.id : uuid();
    const date = validDate(r.date) ? r.date
      : (validDate(fallbackDate) ? fallbackDate
      : new Date().toISOString().slice(0, 10));
    const detail = formatAllah(typeof r.detail === 'string' ? r.detail.slice(0, 2000) : '');
    const debit = digits(typeof r.debit === 'string' ? r.debit.slice(0, 40) : '');
    const credit = digits(typeof r.credit === 'string' ? r.credit.slice(0, 40) : '');
    const numD = parseAmount(debit), numC = parseAmount(credit);
    let finalDebit = debit.trim() && numD !== null ? formatAmount(numD) : debit;
    let finalCredit = credit.trim() && numC !== null ? formatAmount(numC) : credit;
    if (finalDebit.trim() && finalCredit.trim()) {
      // Single-sided accounting rule: one row can only hold either debit or credit
      finalCredit = '';
    }
    return {
      id,
      date,
      detail,
      debit: finalDebit,
      credit: finalCredit
    };
  }

  /**
   * Normalizes customer ledger records and ensures unique codes.
   * @param {Array} khatas
   * @param {string} [fallbackDate]
   * @returns {Array}
   */
  function normalize(khatas, fallbackDate) {
    if (!Array.isArray(khatas)) return [];
    const usedIds = new Set();
    const usedCodes = new Set();
    return khatas.map((k, i) => {
      if (!k || typeof k !== 'object') return null;
      let id = typeof k.id === 'string' && k.id.trim() && k.id.length < 100 ? k.id.trim() : uuid();
      if (usedIds.has(id)) {
        id = uuid();
      }
      usedIds.add(id);

      let rawCode = typeof k.code === 'string' ? k.code.trim().toUpperCase() : '';
      rawCode = rawCode.replace(/[^A-Z0-9\-_ ]/g, '').slice(0, 40);
      let code = rawCode;
      if (!code || (code === 'KH-1001' && k.name === 'پہلا گاہک')) {
        code = String(i + 1);
      }
      const base = code;
      let n = 1;
      while (usedCodes.has(code.toUpperCase())) {
        code = `${base}-${n++}`;
      }
      usedCodes.add(code.toUpperCase());
      const name = typeof k.name === 'string' ? k.name.trim().slice(0, 300) : 'نامعلوم گاہک';
      const mobile = typeof k.mobile === 'string' ? digits(k.mobile.trim().slice(0, 40)) : '';
      const address = typeof k.address === 'string' ? k.address.trim().slice(0, 300) : '';
      const currency = k.currency === 'aed' ? 'aed' : 'pkr';
      const rows = Array.isArray(k.rows)
        ? k.rows.map(r => normalizeRow(r, fallbackDate)).filter(Boolean).filter(hasData)
        : [];
      return { id, code, name, mobile, address, currency, rows };
    }).filter(Boolean);
  }

  /**
   * Mounts the Khata controller and binds DOM interactions.
   * @param {object} options
   * @returns {object}
   */
  function mount({ getState, save, today, exportSheet, download }) {
    const $ = id => document.getElementById(id);
    const getToday = () => (typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10));

    function formatDisplayDate(dateStr) {
      if (!dateStr || typeof dateStr !== 'string') return '';
      const parts = dateStr.trim().split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
        }
        if (parts[2].length === 4) {
          return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
        }
      }
      return dateStr;
    }

    // Inject invalid input styling once
    if (!document.getElementById('khata-injected-styles')) {
      const style = document.createElement('style');
      style.id = 'khata-injected-styles';
      style.textContent = 'input.is-invalid { outline: 2px solid #dc2626 !important; background-color: #fef2f2 !important; }';
      document.head.append(style);
    }

    let activeKhataId = (() => {
      try { return localStorage.getItem('hisaab-active-khata-id') || null; } catch (_) { return null; }
    })();
    const rowNodes = new Map();

    let dateFilterFrom = '';
    let dateFilterTo = '';

    function isRowInDateRange(rowDate, fromDate, toDate) {
      if (!fromDate && !toDate) return true;
      if (!rowDate) return false;
      const f = fromDate || toDate;
      const t = toDate || fromDate;
      const min = f <= t ? f : t;
      const max = f <= t ? t : f;
      return rowDate >= min && rowDate <= max;
    }

    function getFilterPeriodText() {
      const f = dateFilterFrom;
      const t = dateFilterTo;
      if (!f && !t) return 'مکمل کھاتہ ریکارڈ';
      const min = (f && t) ? (f <= t ? f : t) : (f || t);
      const max = (f && t) ? (f <= t ? t : f) : (f || t);
      if (min === max) {
        return `تاریخ: ${formatDisplayDate(min)}`;
      }
      return `دورانیہ: ${formatDisplayDate(min)} تا ${formatDisplayDate(max)}`;
    }

    function setDateFilter(from, to) {
      dateFilterFrom = from ? from.trim() : '';
      dateFilterTo = to ? to.trim() : '';
      const fEl = $('khata-filter-from');
      const tEl = $('khata-filter-to');
      if (fEl && fEl.value !== dateFilterFrom) fEl.value = dateFilterFrom;
      if (tEl && tEl.value !== dateFilterTo) tEl.value = dateFilterTo;
      recalculate(getActiveKhata());
    }

    let directoryFilter = 'all'; // 'all' | 'receivables' | 'payables'

    function setDirectoryFilter(filter) {
      directoryFilter = filter || 'all';
      const tabs = [
        { id: 'tab-khata-all', val: 'all' },
        { id: 'tab-khata-receivables', val: 'receivables' },
        { id: 'tab-khata-payables', val: 'payables' }
      ];
      tabs.forEach(t => {
        const el = $(t.id);
        if (el) {
          const isActive = t.val === directoryFilter;
          el.classList.toggle('active', isActive);
          el.setAttribute('aria-selected', String(isActive));
        }
      });
      renderDirectory();
    }

    const getKhatas = () => {
      const state = getState();
      if (!Array.isArray(state.khatas)) state.khatas = [];
      return state.khatas;
    };

    function selectKhata(id) {
      if (activeKhataId !== id) {
        dateFilterFrom = '';
        dateFilterTo = '';
        const fEl = $('khata-filter-from');
        const tEl = $('khata-filter-to');
        if (fEl) fEl.value = '';
        if (tEl) tEl.value = '';
      }
      activeKhataId = id || null;
      try {
        if (activeKhataId) localStorage.setItem('hisaab-active-khata-id', activeKhataId);
        else localStorage.removeItem('hisaab-active-khata-id');
      } catch (_) {}
    }

    function getActiveKhata() {
      const list = getKhatas();
      let found = list.find(k => k.id === activeKhataId);
      if (!found) {
        found = list[0] || null;
        selectKhata(found?.id);
      }
      return found;
    }

    function nextKhataCode() {
      const list = getKhatas();
      let maxNum = 0;
      for (const k of list) {
        if (!k) continue;
        const raw = String(k.code || '').trim();
        const m = raw.match(/(\d+)/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
      return String(maxNum + 1);
    }

    function ensureDraft(khata, { appendNode = false } = {}) {
      if (!khata || !Array.isArray(khata.rows)) return null;
      let draft = khata.rows.find(r => !hasData(r));
      let isNew = false;
      if (!draft) {
        draft = { id: uuid(), date: getToday(), detail: '', debit: '', credit: '' };
        khata.rows.push(draft);
        isNew = true;
      }
      if (appendNode && (!rowNodes.has(draft.id) || isNew)) {
        addRowNode(draft, khata);
      }
      return draft;
    }

    /**
     * Recalculates ledger totals, running balances, and input validations.
     * @param {object} khata
     */
    function recalculate(khata) {
      if (!khata) return;
      let running = 0n;
      let totDebit = 0n;
      let totCredit = 0n;
      let serial = 1;

      const f = dateFilterFrom;
      const t = dateFilterTo;
      const hasFilter = Boolean(f || t);
      const minDate = (f && t) ? (f <= t ? f : t) : (f || t);
      const maxDate = (f && t) ? (f <= t ? t : f) : (f || t);

      // If date filter is active, calculate brought-forward balance prior to minDate
      let sabqaAmount = 0n;
      let sabqaHasDec = false;
      if (hasFilter) {
        for (const r of khata.rows) {
          if (hasData(r) && r.date && r.date < minDate) {
            const nd = parseAmount(r.debit);
            const nc = parseAmount(r.credit);
            if (nd !== null) {
              sabqaAmount += nd;
              if (nd % 100n !== 0n) sabqaHasDec = true;
            }
            if (nc !== null) {
              sabqaAmount -= nc;
              if (nc % 100n !== 0n) sabqaHasDec = true;
            }
          }
        }
        running = sabqaAmount;
      }

      const hasDecimals = khata.rows.some(r => {
        const nd = parseAmount(r.debit);
        const nc = parseAmount(r.credit);
        return (nd !== null && nd % 100n !== 0n) || (nc !== null && nc % 100n !== 0n);
      });

      for (const r of khata.rows) {
        const tr = rowNodes.get(r.id);
        const isDraft = !hasData(r);
        const dStr = typeof r.debit === 'string' ? r.debit.trim() : '';
        const cStr = typeof r.credit === 'string' ? r.credit.trim() : '';
        const numD = parseAmount(dStr);
        const numC = parseAmount(cStr);

        // Check if row falls in date filter
        const inFilter = !hasFilter || (hasData(r) && r.date && r.date >= minDate && r.date <= maxDate);

        if (tr) {
          tr.hidden = hasFilter ? !inFilter : false;
          tr.classList.toggle('khata-draft', isDraft);
          const sCell = tr.querySelector('.td-serial');
          if (sCell) sCell.textContent = isDraft ? '＋' : (inFilter ? formatCount(serial++) : '—');

          const banamInput = tr.querySelector('td:nth-child(4) input');
          const jamaInput = tr.querySelector('td:nth-child(5) input');

          if (dStr) {
            if (numD === null) banamInput?.classList.add('is-invalid');
            else banamInput?.classList.remove('is-invalid');
          } else {
            banamInput?.classList.remove('is-invalid');
          }

          if (cStr) {
            if (numC === null) jamaInput?.classList.add('is-invalid');
            else jamaInput?.classList.remove('is-invalid');
          } else {
            jamaInput?.classList.remove('is-invalid');
          }
        }

        if (!isDraft) {
          const dVal = numD !== null ? numD : 0n;
          const cVal = numC !== null ? numC : 0n;

          if (inFilter) {
            totDebit += dVal;
            totCredit += cVal;
            running += (dVal - cVal);
          } else if (!hasFilter) {
            totDebit += dVal;
            totCredit += cVal;
            running += (dVal - cVal);
          }

          if (tr) {
            const bCell = tr.querySelector('.td-baqaya');
            if (bCell) {
              const absVal = running < 0n ? -running : running;
              const formattedAbs = formatAmount(absVal, { withDecimals: hasDecimals });
              const isBanam = running > 0n;
              const isJama = running < 0n;
              const tagText = isBanam ? 'بنام (لینا ہے)' : isJama ? 'جمع (دینا ہے)' : 'برابر ✓';
              const sideText = isBanam ? 'بنام' : isJama ? 'جمع' : 'برابر';

              bCell.classList.toggle('is-banam', isBanam);
              bCell.classList.toggle('is-jama', isJama);

              let numSpan = bCell.querySelector('.khata-screen-bal');
              let tag = bCell.querySelector('.khata-screen-bal-tag');
              let amtSpan = bCell.querySelector('.khata-bal-amount');
              let sideSpan = bCell.querySelector('.khata-bal-side');

              if (!numSpan || !tag || !amtSpan || !sideSpan) {
                bCell.replaceChildren();
                numSpan = document.createElement('span');
                numSpan.className = 'khata-screen-bal eng-num';
                tag = document.createElement('span');
                tag.className = 'bal-tag khata-screen-bal-tag';
                const printBal = document.createElement('span');
                printBal.className = 'khata-print-val khata-print-bal';
                amtSpan = document.createElement('span');
                amtSpan.className = 'khata-bal-amount eng-num';
                sideSpan = document.createElement('span');
                sideSpan.className = 'khata-bal-side';
                printBal.append(amtSpan, sideSpan);
                bCell.append(numSpan, tag, printBal);
              }

              if (numSpan.textContent !== formattedAbs) numSpan.textContent = formattedAbs;
              if (tag.textContent !== tagText) tag.textContent = tagText;
              if (amtSpan.textContent !== formattedAbs) amtSpan.textContent = formattedAbs;
              if (sideSpan.textContent !== sideText) sideSpan.textContent = sideText;
            }

            // Sync static print text for other cells
            const pvDate = tr.querySelector('.td-date .khata-print-val');
            const pvDetail = tr.querySelector('.td-detail .khata-print-val');
            const pvBanam = tr.querySelector('.td-banam .khata-print-val');
            const pvJama = tr.querySelector('.td-jama .khata-print-val');
            if (pvDate) pvDate.textContent = r.date || '';
            if (pvDetail) pvDetail.textContent = r.detail || '';
            if (pvBanam) pvBanam.textContent = r.debit || '';
            if (pvJama) pvJama.textContent = r.credit || '';
          }
        } else if (tr) {
          const bCell = tr.querySelector('.td-baqaya');
          if (bCell) {
            bCell.classList.remove('is-jama', 'is-banam');
            bCell.replaceChildren();
          }
        }
      }

      // Update Filter Badge
      const filterBadge = $('khata-filter-badge');
      if (filterBadge) {
        if (hasFilter) {
          filterBadge.hidden = false;
          filterBadge.textContent = `${serial - 1} اندراجات (فلٹر لاگو)`;
        } else {
          filterBadge.hidden = true;
        }
      }

      // Update Header Stats
      const statBanam = $('khata-total-banam');
      const statJama = $('khata-total-jama');
      const statBal = $('khata-net-balance');
      const statBalBox = $('khata-stat-balance-box');
      const statBalStatus = $('khata-balance-status');

      if (statBanam) statBanam.textContent = formatAmount(totDebit, { withDecimals: hasDecimals });
      if (statJama) statJama.textContent = formatAmount(totCredit, { withDecimals: hasDecimals });

      const netAbs = running < 0n ? -running : running;
      if (statBal) statBal.textContent = formatAmount(netAbs, { withDecimals: hasDecimals });

      if (statBalBox && statBalStatus) {
        statBalBox.classList.remove('is-jama', 'is-banam');
        if (running > 0n) {
          statBalBox.classList.add('is-banam');
          statBalStatus.textContent = 'بنام (لینا ہے)';
        } else if (running < 0n) {
          statBalBox.classList.add('is-jama');
          statBalStatus.textContent = 'جمع (دینا ہے / پیشگی)';
        } else {
          statBalStatus.textContent = 'حساب برابر ✓';
        }
      }

      // Update Table Footer
      const tfootBanam = $('khata-foot-banam');
      const tfootJama = $('khata-foot-jama');
      const tfootBaqaya = $('khata-foot-baqaya');
      if (tfootBanam) tfootBanam.textContent = formatAmount(totDebit, { withDecimals: hasDecimals });
      if (tfootJama) tfootJama.textContent = formatAmount(totCredit, { withDecimals: hasDecimals });
      if (tfootBaqaya) {
        tfootBaqaya.replaceChildren();
        tfootBaqaya.classList.toggle('is-banam', running > 0n);
        tfootBaqaya.classList.toggle('is-jama', running < 0n);
        const wrapSpan = document.createElement('span');
        wrapSpan.className = 'khata-bal-wrap';

        const footAmtSpan = document.createElement('span');
        footAmtSpan.className = 'khata-bal-amount eng-num';
        footAmtSpan.textContent = formatAmount(netAbs, { withDecimals: hasDecimals });

        const footSideSpan = document.createElement('span');
        footSideSpan.className = 'khata-bal-side';
        footSideSpan.textContent = running > 0n ? 'بنام' : running < 0n ? 'جمع' : 'برابر';

        wrapSpan.append(footAmtSpan, footSideSpan);
        tfootBaqaya.append(wrapSpan);
      }

      // Update print dossier period & summary snapshots
      const periodEl = $('khata-print-period');
      if (periodEl) periodEl.textContent = getFilterPeriodText();

      const sumSabqaEl = $('khata-print-sum-sabqa');
      const sumBanamEl = $('khata-print-sum-banam');
      const sumJamaEl = $('khata-print-sum-jama');
      const sumBalEl = $('khata-print-sum-balance');
      const sumStatEl = $('khata-print-sum-status');

      if (!hasFilter && khata) {
        if (khata.openingBalance !== undefined && khata.openingBalance !== null && khata.openingBalance !== '') {
          const ob = parseAmount(khata.openingBalance);
          if (ob !== null) {
            sabqaAmount = ob < 0n ? -ob : ob;
            if (ob % 100n !== 0n) sabqaHasDec = true;
          }
        }
        if (sabqaAmount === 0n && Array.isArray(khata.rows)) {
          const firstRow = khata.rows.find(r => r && hasData(r) && r.detail && (/سابقہ|opening/i.test(r.detail)));
          if (firstRow) {
            const nd = parseAmount(firstRow.debit);
            const nc = parseAmount(firstRow.credit);
            if (nd !== null && nd > 0n) {
              sabqaAmount = nd;
              if (nd % 100n !== 0n) sabqaHasDec = true;
            } else if (nc !== null && nc > 0n) {
              sabqaAmount = nc;
              if (nc % 100n !== 0n) sabqaHasDec = true;
            }
          }
        }
      }

      if (sumSabqaEl) {
        const absSabqa = sabqaAmount < 0n ? -sabqaAmount : sabqaAmount;
        const sideSuffix = hasFilter && sabqaAmount !== 0n ? (sabqaAmount > 0n ? ' (بنام)' : ' (جمع)') : '';
        sumSabqaEl.textContent = `${formatAmount(absSabqa, { withDecimals: sabqaHasDec || hasDecimals })}${sideSuffix}`;
      }
      if (sumBanamEl) sumBanamEl.textContent = formatAmount(totDebit, { withDecimals: hasDecimals });
      if (sumJamaEl) sumJamaEl.textContent = formatAmount(totCredit, { withDecimals: hasDecimals });
      if (sumBalEl) sumBalEl.textContent = formatAmount(netAbs, { withDecimals: hasDecimals });
      if (sumStatEl) {
        if (running > 0n) {
          sumStatEl.textContent = 'خالص بقایا (بنام - قابلِ وصول / لینا ہے)';
        } else if (running < 0n) {
          sumStatEl.textContent = 'خالص بقایا (جمع - واجب الادا / دینا ہے)';
        } else {
          sumStatEl.textContent = 'خالص بقایا (حساب برابر ✓)';
        }
      }
    }

    /**
     * Constructs and appends a single row element into the ledger table.
     * @param {object} r
     * @param {object} khata
     * @param {HTMLElement|DocumentFragment} [container]
     */
    function addRowNode(r, khata, container = null) {
      if (rowNodes.has(r.id)) return;
      const tr = document.createElement('tr');
      tr.dataset.id = r.id;
      tr.classList.toggle('khata-draft', !hasData(r));
      rowNodes.set(r.id, tr);

      // 1. Serial
      const tdSerial = document.createElement('td');
      tdSerial.className = 'td-serial';
      if (!hasData(r)) tdSerial.textContent = '＋';
      tr.append(tdSerial);

      // 2. Date
      const tdDate = document.createElement('td');
      tdDate.className = 'td-date';
      const inDate = document.createElement('input');
      inDate.type = 'date';
      inDate.className = 'date-input';
      inDate.value = r.date || getToday();
      const printDate = document.createElement('span');
      printDate.className = 'khata-print-val eng-num';
      printDate.textContent = formatDisplayDate(inDate.value);
      inDate.onchange = () => {
        if (validDate(inDate.value)) {
          r.date = inDate.value;
        } else {
          inDate.value = r.date || getToday();
        }
        printDate.textContent = formatDisplayDate(inDate.value);
        save(true);
      };
      tdDate.append(inDate, printDate);
      tr.append(tdDate);

      // 3. Detail
      const tdDetail = document.createElement('td');
      tdDetail.className = 'td-detail';
      const inDetail = document.createElement('textarea');
      inDetail.value = r.detail || '';
      inDetail.placeholder = 'تفصیل / سامان / ادائیگی...';
      inDetail.rows = 1;
      const printDetail = document.createElement('span');
      printDetail.className = 'khata-print-val khata-print-detail';
      printDetail.textContent = inDetail.value;
      inDetail.oninput = () => {
        inDetail.value = formatAllah(inDetail.value);
        printDetail.textContent = inDetail.value;
        const wasDraft = !hasData(r);
        r.detail = inDetail.value;
        recalculate(khata);
        if (wasDraft && hasData(r)) {
          ensureDraft(khata, { appendNode: true });
        }
        save();
      };
      inDetail.onblur = () => {
        save(true);
      };
      inDetail.onkeydown = e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const isComplete = Boolean(r.detail.trim() && (parseAmount(r.debit) !== null || parseAmount(r.credit) !== null));
          if (isComplete) {
            const next = ensureDraft(khata, { appendNode: true });
            if (next) {
              const nextNode = rowNodes.get(next.id);
              nextNode?.querySelector('textarea')?.focus();
            }
          } else {
            inDetail.blur();
          }
        }
      };
      tdDetail.append(inDetail, printDetail);
      tr.append(tdDetail);

      // 4. Banam (Debit)
      const tdBanam = document.createElement('td');
      tdBanam.className = 'td-banam';
      const inBanam = document.createElement('input');
      inBanam.type = 'text';
      inBanam.inputMode = 'numeric';
      inBanam.className = 'amount eng-num';
      inBanam.value = r.debit || '';
      inBanam.placeholder = '0.00';
      const printBanam = document.createElement('span');
      printBanam.className = 'khata-print-val eng-num';
      printBanam.textContent = r.debit || '';
      inBanam.oninput = () => {
        inBanam.value = digits(inBanam.value);
        const wasDraft = !hasData(r);
        r.debit = inBanam.value;
        printBanam.textContent = r.debit || '';
        if (r.debit.trim() && r.credit.trim()) {
          r.credit = '';
          inJama.value = '';
          printJama.textContent = '';
        }
        recalculate(khata);
        if (wasDraft && hasData(r)) {
          ensureDraft(khata, { appendNode: true });
        }
        save();
      };
      inBanam.onblur = () => {
        const raw = inBanam.value.trim();
        if (!raw) {
          r.debit = '';
          inBanam.value = '';
          printBanam.textContent = '';
          inBanam.classList.remove('is-invalid');
          recalculate(khata);
          save(true);
          return;
        }
        const val = parseAmount(raw);
        if (val !== null) {
          inBanam.value = formatAmount(val);
          r.debit = inBanam.value;
          r.credit = '';
          inJama.value = '';
          printBanam.textContent = r.debit;
          printJama.textContent = '';
          inBanam.classList.remove('is-invalid');
          recalculate(khata);
          save(true);
        } else {
          inBanam.classList.remove('is-invalid');
          inBanam.value = '';
          printBanam.textContent = '';
          r.debit = '';
          recalculate(khata);
          save(true);
        }
      };
      tdBanam.append(inBanam, printBanam);
      tr.append(tdBanam);

      // 5. Jama (Credit)
      const tdJama = document.createElement('td');
      tdJama.className = 'td-jama';
      const inJama = document.createElement('input');
      inJama.type = 'text';
      inJama.inputMode = 'numeric';
      inJama.className = 'amount eng-num';
      inJama.value = r.credit || '';
      inJama.placeholder = '0.00';
      const printJama = document.createElement('span');
      printJama.className = 'khata-print-val eng-num';
      printJama.textContent = r.credit || '';
      inJama.oninput = () => {
        inJama.value = digits(inJama.value);
        const wasDraft = !hasData(r);
        r.credit = inJama.value;
        printJama.textContent = r.credit || '';
        if (r.credit.trim() && r.debit.trim()) {
          r.debit = '';
          inBanam.value = '';
          printBanam.textContent = '';
        }
        recalculate(khata);
        if (wasDraft && hasData(r)) {
          ensureDraft(khata, { appendNode: true });
        }
        save();
      };
      inJama.onblur = () => {
        const raw = inJama.value.trim();
        if (!raw) {
          r.credit = '';
          inJama.value = '';
          printJama.textContent = '';
          inJama.classList.remove('is-invalid');
          recalculate(khata);
          save(true);
          return;
        }
        const val = parseAmount(raw);
        if (val !== null) {
          inJama.value = formatAmount(val);
          r.credit = inJama.value;
          r.debit = '';
          inBanam.value = '';
          printJama.textContent = r.credit;
          printBanam.textContent = '';
          inJama.classList.remove('is-invalid');
          recalculate(khata);
          save(true);
        } else {
          inJama.classList.remove('is-invalid');
          inJama.value = '';
          printJama.textContent = '';
          r.credit = '';
          recalculate(khata);
          save(true);
        }
      };
      inJama.onkeydown = e => {
        if (e.key === 'Tab' && !e.shiftKey) {
          e.preventDefault();
          inJama.blur();
          const next = ensureDraft(khata, { appendNode: true });
          if (next) {
            const nextNode = rowNodes.get(next.id);
            if (nextNode) {
              nextNode.scrollIntoView({ block: 'nearest' });
              nextNode.querySelector('textarea')?.focus();
            }
          }
        }
      };
      tdJama.append(inJama, printJama);
      tr.append(tdJama);

      // 6. Baqaya (Balance)
      const tdBaqaya = document.createElement('td');
      tdBaqaya.className = 'td-baqaya';
      tr.append(tdBaqaya);

      // 7. Delete Row
      const tdDelete = document.createElement('td');
      tdDelete.className = 'td-delete no-print';
      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn-delete-row no-print';
      btnDel.textContent = '×';
      btnDel.title = 'سطر حذف کریں';
      btnDel.onclick = () => {
        if (hasData(r)) {
          if (typeof confirm === 'function' && !confirm('کیا آپ واقعی یہ انٹری حذف کرنا چاہتے ہیں؟')) return;
        }
        khata.rows = khata.rows.filter(x => x.id !== r.id);
        rowNodes.delete(r.id);
        tr.remove();
        ensureDraft(khata, { appendNode: true });
        recalculate(khata);
        save(true);
      };
      tdDelete.append(btnDel);
      tr.append(tdDelete);

      (container || $('khata-rows')).append(tr);
    }

    function renderActiveKhata() {
      const khata = getActiveKhata();
      const hasKhata = Boolean(khata);

      $('khata-profile-section').hidden = !hasKhata;
      $('khata-table-section').hidden = !hasKhata;
      $('khata-empty-placeholder').hidden = hasKhata;

      const actionBtnIds = ['btn-khata-edit', 'btn-khata-print', 'btn-khata-excel', 'btn-khata-delete'];
      actionBtnIds.forEach(btnId => {
        const btn = $(btnId);
        if (btn) btn.disabled = !hasKhata;
      });

      if (!hasKhata) {
        rowNodes.clear();
        $('khata-rows').replaceChildren();
        return;
      }

      // Populate Header Info
      $('khata-view-code').textContent = khata.code;
      $('khata-view-name').textContent = khata.name;
      $('khata-view-mobile').textContent = khata.mobile || '—';
      $('khata-view-address').textContent = khata.address || '—';

      const currBadge = $('khata-view-currency');
      currBadge.textContent = khata.currency === 'aed' ? 'درہم (AED)' : 'پاکستانی روپیہ (PKR)';
      currBadge.className = `khata-currency-badge ${khata.currency}`;

      // Column headers (clean بنام and جمع without currency text)
      $('khata-th-currency-label-1').textContent = 'بنام';
      $('khata-th-currency-label-2').textContent = 'جمع';

      // Render Rows
      ensureDraft(khata);
      rowNodes.clear();
      $('khata-rows').replaceChildren();

      const fragment = document.createDocumentFragment();
      for (const r of khata.rows) {
        addRowNode(r, khata, fragment);
      }
      $('khata-rows').append(fragment);

      recalculate(khata);
    }

    function openNewKhataModal() {
      const codeInput = $('new-khata-code');
      const nameInput = $('new-khata-name');
      const mobileInput = $('new-khata-mobile');
      const addressInput = $('new-khata-address');
      const currSelect = $('new-khata-currency');
      const balanceInput = $('new-khata-opening-balance');
      const balanceType = $('new-khata-opening-type');
      const curTag = $('new-khata-cur-tag');

      if (codeInput) {
        codeInput.value = nextKhataCode();
        codeInput.readOnly = true;
      }
      if (nameInput) nameInput.value = '';
      if (mobileInput) mobileInput.value = '';
      if (addressInput) addressInput.value = '';
      if (currSelect) currSelect.value = 'pkr';
      if (balanceInput) balanceInput.value = '';
      if (balanceType) balanceType.value = 'debit';
      if (curTag) curTag.textContent = 'PKR';

      const d = $('new-khata-dialog');
      if (d && !d.open) d.showModal();
      nameInput?.focus();
    }

    function openEditKhataModal() {
      const khata = getActiveKhata();
      if (!khata) return;

      const editCode = $('edit-khata-code');
      if (editCode) {
        editCode.value = khata.code;
        editCode.readOnly = true;
      }
      $('edit-khata-name').value = khata.name;
      $('edit-khata-mobile').value = khata.mobile || '';
      $('edit-khata-address').value = khata.address || '';
      const currencySelect = $('edit-khata-currency');
      currencySelect.value = khata.currency || 'pkr';
      currencySelect.disabled = khata.rows.some(hasData);
      currencySelect.title = currencySelect.disabled ? 'اندراجات والے کھاتے کی کرنسی تبدیل نہیں کی جا سکتی۔' : '';

      const d = $('edit-khata-dialog');
      if (d && !d.open) d.showModal();
    }

    function renderDirectory() {
      const list = getKhatas();
      const tbody = $('khata-dir-rows');
      if (!tbody) return;
      tbody.replaceChildren();

      // 1. Calculate running balance and decimal flag for each customer
      let totReceivables = 0n; // sum of positive balances (بنام - لینا ہے)
      let totPayables = 0n;    // sum of negative balances as positive amount (جمع - دینا ہے)
      let recCount = 0;
      let payCount = 0;
      let hasAnyDec = false;

      const evaluatedList = list.map(k => {
        let running = 0n;
        let hasDec = false;
        for (const r of k.rows) {
          if (hasData(r)) {
            const nd = parseAmount(r.debit) || 0n;
            const nc = parseAmount(r.credit) || 0n;
            if (nd % 100n !== 0n || nc % 100n !== 0n) {
              hasDec = true;
              hasAnyDec = true;
            }
            running += (nd - nc);
          }
        }
        if (running > 0n) {
          totReceivables += running;
          recCount++;
        } else if (running < 0n) {
          totPayables += (-running);
          payCount++;
        }
        return { khata: k, running, hasDec };
      });

      // Update Badges on Category Tabs
      const badgeAll = $('badge-khata-all-count');
      const badgeRec = $('badge-khata-receivables-count');
      const badgePay = $('badge-khata-payables-count');
      if (badgeAll) badgeAll.textContent = formatCount(list.length);
      if (badgeRec) badgeRec.textContent = formatCount(recCount);
      if (badgePay) badgePay.textContent = formatCount(payCount);

      // Update Overview Stats Grid
      const statCount = $('khata-dir-total-count');
      const statReceivables = $('khata-dir-total-banam');
      const statPayables = $('khata-dir-total-jama');
      const statNet = $('khata-dir-net-balance');
      const statBox = $('khata-dir-stat-balance-box');
      const statStatus = $('khata-dir-balance-status');

      if (statCount) statCount.textContent = formatCount(list.length);
      if (statReceivables) statReceivables.textContent = formatAmount(totReceivables, { withDecimals: hasAnyDec });
      if (statPayables) statPayables.textContent = formatAmount(totPayables, { withDecimals: hasAnyDec });

      const netTotal = totReceivables - totPayables;
      const absNet = netTotal < 0n ? -netTotal : netTotal;
      if (statNet) statNet.textContent = formatAmount(absNet, { withDecimals: hasAnyDec });

      if (statBox && statStatus) {
        statBox.classList.remove('is-jama', 'is-banam');
        if (netTotal > 0n) {
          statBox.classList.add('is-banam');
          statStatus.textContent = 'خالص لینا ہے (بنام)';
        } else if (netTotal < 0n) {
          statBox.classList.add('is-jama');
          statStatus.textContent = 'خالص دینا ہے (جمع)';
        } else {
          statStatus.textContent = 'حساب برابر ✓';
        }
      }

      // Update Filter Description Info
      const filterDesc = $('khata-dir-filter-desc');
      if (filterDesc) {
        if (directoryFilter === 'receivables') {
          filterDesc.textContent = `صرف قابلِ وصول (لینا ہے) کھاتے دکھائے جا رہے ہیں (${formatCount(recCount)})`;
        } else if (directoryFilter === 'payables') {
          filterDesc.textContent = `صرف واجب الادا (دینا ہے) کھاتے دکھائے جا رہے ہیں (${formatCount(payCount)})`;
        } else {
          filterDesc.textContent = `تمام کسٹمرز کھاتہ داروں کی فہرست دکھائی جا رہی ہے (${formatCount(list.length)})`;
        }
      }

      // Filter based on directoryFilter
      let filtered = evaluatedList;
      if (directoryFilter === 'receivables') {
        filtered = evaluatedList.filter(item => item.running > 0n);
      } else if (directoryFilter === 'payables') {
        filtered = evaluatedList.filter(item => item.running < 0n);
      }

      // Filter based on search query
      const searchInput = $('khata-dir-search');
      const query = searchInput ? digits(searchInput.value.toLowerCase().trim()) : '';
      if (query) {
        filtered = filtered.filter(item => {
          const k = item.khata;
          return (
            k.code.toLowerCase().includes(query) ||
            k.name.toLowerCase().includes(query) ||
            (k.mobile && k.mobile.includes(query)) ||
            (k.address && k.address.toLowerCase().includes(query))
          );
        });
      }

      // Update count indicator
      const countEl = $('khata-dir-count');
      if (countEl) {
        if (query || directoryFilter !== 'all') {
          countEl.textContent = `نتائج: ${formatCount(filtered.length)} / ${formatCount(list.length)}`;
        } else {
          countEl.textContent = `کل کھاتے: ${formatCount(list.length)}`;
        }
      }

      // Render Table Rows
      if (!list.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'summary-empty-cell khata-empty-dir-cell';

        const wrap = document.createElement('div');
        wrap.className = 'khata-empty-content';

        const icon = document.createElement('div');
        icon.className = 'khata-empty-icon-wrap';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>`;

        const title = document.createElement('h3');
        title.className = 'khata-empty-title';
        title.textContent = 'ابھی کوئی کسٹمر کھاتہ موجود نہیں ہے';

        const sub = document.createElement('p');
        sub.className = 'khata-empty-sub';
        sub.textContent = 'کاروبار کے کسٹمرز یا پارٹیوں کا لیجر کھاتہ بنانے کے لیے نیا کسٹمر کھاتہ بنائیں۔';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-khata-new btn-khata-empty-action';
        btn.innerHTML = '<span>＋ نیا کسٹمر کھاتہ بنائیں</span>';
        btn.onclick = openNewKhataModal;

        wrap.append(icon, title, sub, btn);
        td.append(wrap);
        tr.append(td);
        tbody.append(tr);

        const footBal = $('khata-dir-foot-bal');
        if (footBal) footBal.textContent = '0 برابر';
      } else if (!filtered.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'summary-empty-cell khata-empty-dir-cell';

        const wrap = document.createElement('div');
        wrap.className = 'khata-empty-content';

        const icon = document.createElement('div');
        icon.className = 'khata-empty-icon-wrap';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>`;

        const title = document.createElement('h3');
        title.className = 'khata-empty-title';

        const sub = document.createElement('p');
        sub.className = 'khata-empty-sub';

        if (query) {
          title.textContent = 'تلاش کے مطابق کوئی کھاتہ نہیں ملا';
          sub.textContent = `"${query}" سے ملتا جلتا کوئی نام، کوڈ، موبائل یا پتہ موجود نہیں ہے۔`;
        } else if (directoryFilter === 'receivables') {
          title.textContent = 'کوئی قابلِ وصول کھاتہ نہیں ملا';
          sub.textContent = 'اس وقت تمام کسٹمرز کے واجبات صفر یا ادا شدہ ہیں۔';
        } else if (directoryFilter === 'payables') {
          title.textContent = 'کوئی واجب الادا کھاتہ نہیں ملا';
          sub.textContent = 'اس وقت تمام کسٹمرز کی ادائیگیاں صفر یا مکمل ہیں۔';
        } else {
          title.textContent = 'کوئی ریکارڈ موجود نہیں ہے';
          sub.textContent = 'فہرست دوبارہ دیکھنے کے لیے فلٹر ری سیٹ کریں۔';
        }

        const resetBtn = document.createElement('button');
        resetBtn.type = 'button';
        resetBtn.className = 'btn-khata-action';
        resetBtn.innerHTML = '<span>تمام کھاتے دیکھیں</span>';
        resetBtn.onclick = () => {
          if (searchInput) searchInput.value = '';
          setDirectoryFilter('all');
        };

        wrap.append(icon, title, sub, resetBtn);
        td.append(wrap);
        tr.append(td);
        tbody.append(tr);

        const footBal = $('khata-dir-foot-bal');
        if (footBal) {
          footBal.className = 'dir-tfoot-val is-zero';
          footBal.innerHTML = '<div class="dir-bal-split"><span class="dir-bal-amt eng-num">0</span><span class="dir-bal-tag">برابر</span></div>';
        }
      } else {
        const fragment = document.createDocumentFragment();
        let displayedNet = 0n;

        filtered.forEach((item, idx) => {
          const k = item.khata;
          const running = item.running;
          const hasDec = item.hasDec;
          displayedNet += running;
          const absVal = running < 0n ? -running : running;

          const tr = document.createElement('tr');
          tr.onclick = e => {
            if (e.target?.closest?.('.btn-open-khata')) return; // Handled by button
            showLedgerView(k.id);
          };

          const tdIdx = document.createElement('td');
          tdIdx.className = 'eng-num';
          tdIdx.textContent = formatCount(idx + 1);

          const tdCode = document.createElement('td');
          const strong = document.createElement('strong');
          strong.className = 'khata-code-badge eng-num';
          strong.textContent = k.code;
          tdCode.append(strong);

          const tdName = document.createElement('td');
          tdName.style.fontWeight = '700';
          tdName.textContent = k.name;

          const tdMobile = document.createElement('td');
          tdMobile.className = 'eng-num';
          tdMobile.textContent = k.mobile || '—';

          const tdCurr = document.createElement('td');
          tdCurr.textContent = k.currency === 'aed' ? 'درہم (AED)' : 'روپیہ (PKR)';

          const tdBal = document.createElement('td');
          tdBal.className = 'dir-td-bal ' + (running > 0n ? 'is-banam' : running < 0n ? 'is-jama' : 'is-zero');

          const splitWrap = document.createElement('div');
          splitWrap.className = 'dir-bal-split';

          const amtSpan = document.createElement('span');
          amtSpan.className = 'dir-bal-amt eng-num';
          amtSpan.textContent = formatAmount(absVal, { withDecimals: hasDec });

          const tagSpan = document.createElement('span');
          tagSpan.className = 'dir-bal-tag';
          tagSpan.textContent = running > 0n ? 'بنام' : running < 0n ? 'جمع' : 'برابر';

          splitWrap.append(amtSpan, tagSpan);
          tdBal.append(splitWrap);

          const tdAction = document.createElement('td');
          tdAction.style.textAlign = 'center';
          const btnOpen = document.createElement('button');
          btnOpen.type = 'button';
          btnOpen.className = 'btn-open-khata';
          btnOpen.innerHTML = '<span>کھاتہ کھولیں</span> <span aria-hidden="true">➔</span>';
          btnOpen.onclick = e => {
            e.stopPropagation();
            showLedgerView(k.id);
          };
          tdAction.append(btnOpen);

          tr.append(tdIdx, tdCode, tdName, tdMobile, tdCurr, tdBal, tdAction);
          fragment.append(tr);
        });
        tbody.append(fragment);

        // Update Table Headers and Footer based on filter
        const thBal = $('khata-dir-th-bal');
        if (thBal) {
          if (directoryFilter === 'receivables') {
            thBal.textContent = 'قابلِ وصول رقم (لینا ہے)';
          } else if (directoryFilter === 'payables') {
            thBal.textContent = 'واجب الادا رقم (دینا ہے)';
          } else {
            thBal.textContent = 'بقایا بیلنس';
          }
        }

        const tfootLabel = $('khata-dir-tfoot-label');
        if (tfootLabel) {
          if (directoryFilter === 'receivables') {
            tfootLabel.textContent = 'کل قابلِ وصول میزان:';
          } else if (directoryFilter === 'payables') {
            tfootLabel.textContent = 'کل واجب الادا میزان:';
          } else {
            tfootLabel.textContent = 'کل میزان:';
          }
        }

        // Update Table Footer Total Balance
        const footBal = $('khata-dir-foot-bal');
        if (footBal) {
          const absDisplayed = displayedNet < 0n ? -displayedNet : displayedNet;
          const typeText = displayedNet > 0n ? 'بنام' : displayedNet < 0n ? 'جمع' : 'برابر';
          footBal.className = 'dir-tfoot-val ' + (displayedNet > 0n ? 'is-banam' : displayedNet < 0n ? 'is-jama' : 'is-zero');
          footBal.replaceChildren();

          const footSplit = document.createElement('div');
          footSplit.className = 'dir-bal-split';

          const footAmt = document.createElement('span');
          footAmt.className = 'dir-bal-amt eng-num';
          footAmt.textContent = formatAmount(absDisplayed, { withDecimals: hasAnyDec });

          const footTag = document.createElement('span');
          footTag.className = 'dir-bal-tag';
          footTag.textContent = typeText;

          footSplit.append(footAmt, footTag);
          footBal.append(footSplit);
        }
      }
    }

    function showDirectoryView() {
      const dirView = $('khata-directory-view');
      const ledView = $('khata-ledger-view');
      if (dirView) dirView.hidden = false;
      if (ledView) ledView.hidden = true;

      const dirSearch = $('khata-dir-search');
      if (dirSearch) {
        dirSearch.value = '';
        setTimeout(() => dirSearch.focus(), 60);
      }

      renderDirectory();
    }

    function showLedgerView(id) {
      if (id) selectKhata(id);
      const dirView = $('khata-directory-view');
      const ledView = $('khata-ledger-view');
      if (dirView) dirView.hidden = true;
      if (ledView) ledView.hidden = false;

      renderActiveKhata();

      setTimeout(() => {
        if (document.activeElement && document.activeElement.id === 'khata-search') return;
        const khata = getActiveKhata();
        if (khata) {
          const draft = khata.rows.find(r => !hasData(r));
          if (draft) {
            const node = rowNodes.get(draft.id);
            node?.querySelector('textarea')?.focus();
          }
        }
      }, 60);
    }

    function openDirectoryModal() {
      showDirectoryView();
    }

    function canOutputKhata(khata) {
      if (!khata) return false;
      const invalid = khata.rows.find(r => {
        if (!hasData(r)) return false;
        const debit = typeof r.debit === 'string' ? r.debit.trim() : '';
        const credit = typeof r.credit === 'string' ? r.credit.trim() : '';
        return (debit && credit) || (debit && parseAmount(debit) === null) || (credit && parseAmount(credit) === null);
      });
      if (invalid) {
        alert('پرنٹ یا Excel سے پہلے بنام یا جمع کی غلط رقم درست کریں۔ ایک سطر میں صرف ایک طرف رقم درج کی جا سکتی ہے۔');
        return false;
      }
      return true;
    }

    // Bank Statement Print Dossier with Electron Print Preview
    async function printKhata(options = {}) {
      const khata = getActiveKhata();
      if (!canOutputKhata(khata)) return;

      // Recalculate will apply the active date filter, hide/show rows, update running balances and dossier summary
      recalculate(khata);

      // Legacy test hooks
      const titleEl = $('khata-print-customer');
      const metaEl = $('khata-print-meta');
      if (titleEl) titleEl.textContent = `${khata.name} (${khata.code})`;
      if (metaEl) {
        metaEl.textContent = `موبائیل: ${khata.mobile || '—'} | مقام: ${khata.address || '—'} | کرنسی: ${khata.currency === 'aed' ? 'درہم' : 'روپیہ'} | تاریخ پرنٹ: ${getToday()} | دورانیہ: ${getFilterPeriodText()}`;
      }

      // Populate Official Bank Statement Dossier
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = formatDisplayDate(getToday());

      const periodEl = $('khata-print-period');
      if (periodEl) periodEl.textContent = getFilterPeriodText();

      const printDateEl = $('khata-print-date');
      const printTimeEl = $('khata-print-time');
      const printRefEl = $('khata-print-ref');
      const custNameEl = $('khata-print-cust-name');
      const custCodeEl = $('khata-print-cust-code');
      const custMobileEl = $('khata-print-cust-mobile');
      const custAddrEl = $('khata-print-cust-address');
      const custCurrEl = $('khata-print-cust-currency');

      if (printDateEl) printDateEl.textContent = dateStr;
      if (printTimeEl) printTimeEl.textContent = timeStr;
      if (printRefEl) printRefEl.textContent = `${khata.code || '1'}`;

      if (custNameEl) custNameEl.textContent = khata.name;
      if (custCodeEl) custCodeEl.textContent = khata.code;
      if (custMobileEl) custMobileEl.textContent = khata.mobile || 'درج نہیں (—)';
      if (custAddrEl) custAddrEl.textContent = khata.address || 'درج نہیں (—)';
      if (custCurrEl) custCurrEl.textContent = khata.currency === 'aed' ? 'اماراتی درہم' : 'پاکستانی روپیہ';

      // Refresh all cell print spans
      for (const r of khata.rows) {
        const tr = rowNodes.get(r.id);
        if (tr) {
          const pvDate = tr.querySelector('.td-date .khata-print-val');
          const pvDetail = tr.querySelector('.td-detail .khata-print-val');
          const pvBanam = tr.querySelector('.td-banam .khata-print-val');
          const pvJama = tr.querySelector('.td-jama .khata-print-val');
          if (pvDate) pvDate.textContent = formatDisplayDate(r.date) || '';
          if (pvDetail) pvDetail.textContent = r.detail || '';
          if (pvBanam) pvBanam.textContent = r.debit || '';
          if (pvJama) pvJama.textContent = r.credit || '';
        }
      }

      await document.fonts?.ready;

      const restoreTheme = window.prepareForPrintTheme
        ? window.prepareForPrintTheme() : null;

      const f = dateFilterFrom;
      const t = dateFilterTo;
      const hasFilter = Boolean(f || t);
      const minDate = (f && t) ? (f <= t ? f : t) : (f || t);
      const maxDate = (f && t) ? (f <= t ? t : f) : (f || t);
      const dateSuffix = hasFilter ? (minDate === maxDate ? minDate : `${minDate}_تا_${maxDate}`) : getToday();

      // In Electron desktop environment, use previewPDF for flawless native preview
      if (window.electronAPI?.previewPDF) {
        if (document.body.inert) { restoreTheme?.(); return; }
        document.body.inert = true;
        try {
          const safeName = (khata.name || 'کھاتہ').replace(/[<>:"/\\|?*]/g, '_');
          const fileName = `لیجر_${safeName}_${dateSuffix}.pdf`;
          const result = options?.savePDF && window.electronAPI?.savePDF
            ? await window.electronAPI.savePDF(fileName, { landscape: false })
            : await window.electronAPI.previewPDF({ landscape: false });
          if (result?.status === 'error') {
            alert('پرنٹ پیش منظر نہیں کھل سکا۔ دوبارہ کوشش کریں۔');
          }
          return result;
        } catch (_) {
          alert('پرنٹ پیش منظر نہیں کھل سکا۔ دوبارہ کوشش کریں۔');
        } finally {
          document.body.inert = false;
          restoreTheme?.();
        }
      }

      // Browser fallback (Web version): window.print()
      try {
        window.print();
      } finally {
        restoreTheme?.();
      }
    }

    function exportKhataExcel() {
      const khata = getActiveKhata();
      if (!canOutputKhata(khata) || !exportSheet) return;

      const f = dateFilterFrom;
      const t = dateFilterTo;
      const hasFilter = Boolean(f || t);
      const minDate = (f && t) ? (f <= t ? f : t) : (f || t);
      const maxDate = (f && t) ? (f <= t ? t : f) : (f || t);

      let bal = 0n;
      let totD = 0n;
      let totC = 0n;
      let sabqaAmount = 0n;

      if (hasFilter) {
        for (const r of khata.rows) {
          if (hasData(r) && r.date && r.date < minDate) {
            const nd = parseAmount(r.debit);
            const nc = parseAmount(r.credit);
            if (nd !== null) sabqaAmount += nd;
            if (nc !== null) sabqaAmount -= nc;
          }
        }
        bal = sabqaAmount;
      }

      const allValidRows = khata.rows.filter(hasData);
      const filteredRows = hasFilter
        ? allValidRows.filter(r => r.date && r.date >= minDate && r.date <= maxDate)
        : allValidRows;

      const hasDec = filteredRows.some(r => {
        const nd = parseAmount(r.debit) || 0n;
        const nc = parseAmount(r.credit) || 0n;
        return nd % 100n !== 0n || nc % 100n !== 0n;
      }) || (sabqaAmount % 100n !== 0n);

      const dataRows = [];

      if (hasFilter && sabqaAmount !== 0n) {
        const absSabqa = sabqaAmount < 0n ? -sabqaAmount : sabqaAmount;
        const sabqaSide = sabqaAmount > 0n ? 'بنام' : 'جمع';
        dataRows.push([
          '—',
          minDate,
          'سابقہ بقایا (Brought Forward)',
          sabqaAmount > 0n ? { number: minorToDecimalString(sabqaAmount) } : '',
          sabqaAmount < 0n ? { number: minorToDecimalString(-sabqaAmount) } : '',
          `${formatAmount(absSabqa, { withDecimals: hasDec })} ${sabqaSide}`
        ]);
      }

      filteredRows.forEach((r, i) => {
        const d = parseAmount(r.debit);
        const c = parseAmount(r.credit);
        const dMinor = d !== null ? d : 0n;
        const cMinor = c !== null ? c : 0n;
        totD += dMinor;
        totC += cMinor;
        bal += (dMinor - cMinor);
        const absBal = bal < 0n ? -bal : bal;
        const balLabel = `${formatAmount(absBal, { withDecimals: hasDec })} ${bal > 0n ? 'بنام' : bal < 0n ? 'جمع' : 'برابر'}`;
        const debitCell = d !== null && d > 0n ? { number: minorToDecimalString(d) } : (d === 0n ? { number: '0.00' } : '');
        const creditCell = c !== null && c > 0n ? { number: minorToDecimalString(c) } : (c === 0n ? { number: '0.00' } : '');
        dataRows.push([i + 1, r.date, r.detail, debitCell, creditCell, balLabel]);
      });

      const currencyName = khata.currency === 'aed' ? 'اماراتی درہم (AED)' : 'پاکستانی روپیہ (PKR)';
      const netBalAbs = bal < 0n ? -bal : bal;
      const dateSuffix = hasFilter ? (minDate === maxDate ? minDate : `${minDate}_تا_${maxDate}`) : getToday();

      const rows = [
        ['کسٹمرز کھاتے لیجر — Hisaab App'],
        ['کسٹمر کا نام', khata.name, 'کھاتہ کوڈ', khata.code],
        ['موبائیل نمبر', khata.mobile || '—', 'پتہ / مقام', khata.address || '—'],
        ['کرنسی', currencyName, 'اسٹیٹمنٹ دورانیہ', getFilterPeriodText()],
        ['تاریخ رپورٹ', getToday()],
        [],
        ['نمبر شمار', 'تاریخ', 'تفصیل', `بنام (${khata.currency.toUpperCase()})`, `جمع (${khata.currency.toUpperCase()})`, 'بقایا'],
        ...dataRows,
        [],
        ['', 'کل میزان', '', { number: minorToDecimalString(totD) }, { number: minorToDecimalString(totC) }, `${formatAmount(netBalAbs, { withDecimals: hasDec })} ${bal > 0n ? 'بنام' : bal < 0n ? 'جمع' : 'برابر'}`]
      ];

      exportSheet(rows, `کھاتہ_${khata.code}_${khata.name}_${dateSuffix}.xlsx`);
    }

    // Official Bank Statement Dossier for Customer Directory / Receivables / Payables Print
    async function printDirectoryReport(options = {}) {
      const list = getKhatas();
      if (!list.length) {
        alert('پرنٹ کرنے کے لیے کوئی کسٹمر کھاتہ موجود نہیں ہے۔');
        return;
      }

      // Ensure latest render is in sync
      renderDirectory();

      // Populate Print Dossier
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = formatDisplayDate(getToday());

      let totReceivables = 0n;
      let totPayables = 0n;
      let hasAnyDec = false;

      list.forEach(k => {
        let running = 0n;
        for (const r of k.rows) {
          if (hasData(r)) {
            const nd = parseAmount(r.debit) || 0n;
            const nc = parseAmount(r.credit) || 0n;
            if (nd % 100n !== 0n || nc % 100n !== 0n) hasAnyDec = true;
            running += (nd - nc);
          }
        }
        if (running > 0n) totReceivables += running;
        else if (running < 0n) totPayables += (-running);
      });

      const netTotal = totReceivables - totPayables;
      const absNet = netTotal < 0n ? -netTotal : netTotal;

      let mainTitle = 'کسٹمرز کھاتے — جامع گوشوارہ بیلنس';
      let typeTitle = 'جامع گوشوارہ کسٹمرز کھاتے (تمام کھاتہ جات)';
      let subTitle = 'تمام کسٹمرز کے واجبات و وصولیوں کی تفصیلی بیلنس پوزیشن';
      let fileType = 'تمام_کھاتے';

      if (directoryFilter === 'receivables') {
        mainTitle = 'کسٹمرز کھاتے — قابلِ وصول رپورٹ';
        typeTitle = '';
        subTitle = 'جن گاہکوں سے رقم وصول کرنی ہے (بنام بیلنس پوزیشن)';
        fileType = 'قابل_وصول';
      } else if (directoryFilter === 'payables') {
        mainTitle = 'کسٹمرز کھاتے — واجب الادا رپورٹ';
        typeTitle = '';
        subTitle = 'جن گاہکوں کو رقم ادا کرنی ہے (جمع بیلنس پوزیشن)';
        fileType = 'واجب_الادا';
      }

      const printTypeEl = $('khata-dir-print-type');
      const printMainTitleEl = $('khata-dir-print-main-title');
      const printSubTitleEl = $('khata-dir-print-subtitle');
      const printDateEl = $('khata-dir-print-date');
      const printTimeEl = $('khata-dir-print-time');
      const printCountEl = $('khata-dir-print-count');

      const sumCountEl = $('khata-dir-print-sum-count');
      const sumRecEl = $('khata-dir-print-sum-receivable');
      const sumPayEl = $('khata-dir-print-sum-payable');
      const sumBalEl = $('khata-dir-print-sum-balance');
      const sumStatusEl = $('khata-dir-print-sum-status');

      if (printTypeEl) printTypeEl.textContent = typeTitle;
      if (printMainTitleEl) printMainTitleEl.textContent = mainTitle;
      if (printSubTitleEl) printSubTitleEl.textContent = subTitle;
      if (printDateEl) printDateEl.textContent = dateStr;
      if (printTimeEl) printTimeEl.textContent = timeStr;

      const rowsCount = $('khata-dir-rows')?.querySelectorAll('tr:not(.summary-empty-cell)')?.length || $('khata-dir-rows')?.children?.length || 0;
      if (printCountEl) printCountEl.textContent = `${formatCount(rowsCount)} کھاتے`;

      if (sumCountEl) sumCountEl.textContent = formatCount(rowsCount);
      if (sumRecEl) sumRecEl.textContent = formatAmount(totReceivables, { withDecimals: hasAnyDec });
      if (sumPayEl) sumPayEl.textContent = formatAmount(totPayables, { withDecimals: hasAnyDec });
      if (sumBalEl) {
        const netSide = netTotal > 0n ? 'بنام' : netTotal < 0n ? 'جمع' : 'برابر';
        sumBalEl.textContent = `${formatAmount(absNet, { withDecimals: hasAnyDec })} ${netSide}`;
      }
      if (sumStatusEl) {
        sumStatusEl.textContent = netTotal > 0n ? 'خالص لینا ہے (بنام)' : netTotal < 0n ? 'خالص دینا ہے (جمع)' : 'حساب برابر';
      }

      // Filter Print Dossier Summary Strip & Top Right text
      const cardRec = $('khata-dir-print-card-receivable');
      const cardPay = $('khata-dir-print-card-payable');
      const cardBal = $('khata-dir-print-card-balance');
      const periodBlock = document.querySelector('#khata-dir-print-dossier .khata-print-period-block');

      if (directoryFilter === 'receivables') {
        if (cardRec) cardRec.style.display = '';
        if (cardPay) cardPay.style.display = 'none';
        if (cardBal) cardBal.style.display = 'none';
        if (periodBlock) periodBlock.style.visibility = 'hidden';
      } else if (directoryFilter === 'payables') {
        if (cardRec) cardRec.style.display = 'none';
        if (cardPay) cardPay.style.display = '';
        if (cardBal) cardBal.style.display = 'none';
        if (periodBlock) periodBlock.style.visibility = 'hidden';
      } else {
        if (cardRec) cardRec.style.display = '';
        if (cardPay) cardPay.style.display = '';
        if (cardBal) cardBal.style.display = '';
        if (periodBlock) periodBlock.style.visibility = '';
      }

      document.body.classList.add('khata-dir-printing');
      if (directoryFilter === 'receivables') {
        document.body.classList.add('print-filter-receivables');
      } else if (directoryFilter === 'payables') {
        document.body.classList.add('print-filter-payables');
      }

      await document.fonts?.ready;

      const restoreTheme = window.prepareForPrintTheme
        ? window.prepareForPrintTheme() : null;

      function cleanupPrint() {
        document.body.classList.remove('khata-dir-printing', 'print-filter-receivables', 'print-filter-payables');
        if (cardRec) cardRec.style.display = '';
        if (cardPay) cardPay.style.display = '';
        if (cardBal) cardBal.style.display = '';
        if (periodBlock) periodBlock.style.visibility = '';
        restoreTheme?.();
      }

      const fileName = `کسٹمرز_رپورٹ_${fileType}_${getToday()}.pdf`;

      if (window.electronAPI?.previewPDF) {
        if (document.body.inert) {
          cleanupPrint();
          return;
        }
        document.body.inert = true;
        try {
          const result = options?.savePDF && window.electronAPI?.savePDF
            ? await window.electronAPI.savePDF(fileName, { landscape: false })
            : await window.electronAPI.previewPDF({ landscape: false });
          if (result?.status === 'error') {
            alert('پرنٹ پیش منظر نہیں کھل سکا۔ دوبارہ کوشش کریں۔');
          }
          return result;
        } catch (_) {
          alert('پرنٹ پیش منظر نہیں کھل سکا۔ دوبارہ کوشش کریں۔');
        } finally {
          document.body.inert = false;
          cleanupPrint();
        }
      }

      // Browser fallback (Web version): window.print()
      try {
        window.print();
      } finally {
        cleanupPrint();
      }
    }

    function exportDirectoryExcel() {
      if (!exportSheet) return;
      const list = getKhatas();
      if (!list.length) {
        alert('ایکسپورٹ کرنے کے لیے کوئی کسٹمر کھاتہ موجود نہیں ہے۔');
        return;
      }

      let totReceivables = 0n;
      let totPayables = 0n;

      const evaluated = list.map(k => {
        let running = 0n;
        for (const r of k.rows) {
          if (hasData(r)) {
            const nd = parseAmount(r.debit) || 0n;
            const nc = parseAmount(r.credit) || 0n;
            running += (nd - nc);
          }
        }
        if (running > 0n) totReceivables += running;
        else if (running < 0n) totPayables += (-running);
        return { khata: k, running };
      });

      let filtered = evaluated;
      let reportType = 'جامع فہرست تمام کسٹمرز کھاتے';
      let filterSlug = 'تمام_کھاتے';

      if (directoryFilter === 'receivables') {
        filtered = evaluated.filter(item => item.running > 0n);
        reportType = 'فہرست قابلِ وصول کسٹمرز کھاتے (لینا ہے)';
        filterSlug = 'قابل_وصول';
      } else if (directoryFilter === 'payables') {
        filtered = evaluated.filter(item => item.running < 0n);
        reportType = 'فہرست واجب الادا کسٹمرز کھاتے (دینا ہے)';
        filterSlug = 'واجب_الادا';
      }

      const query = $('khata-dir-search') ? digits($('khata-dir-search').value.toLowerCase().trim()) : '';
      if (query) {
        filtered = filtered.filter(item => {
          const k = item.khata;
          return (
            k.code.toLowerCase().includes(query) ||
            k.name.toLowerCase().includes(query) ||
            (k.mobile && k.mobile.includes(query)) ||
            (k.address && k.address.toLowerCase().includes(query))
          );
        });
      }

      let displayedNet = 0n;
      const dataRows = filtered.map((item, idx) => {
        const k = item.khata;
        const running = item.running;
        displayedNet += running;
        const absVal = running < 0n ? -running : running;
        const side = running > 0n ? 'بنام (لینا ہے)' : running < 0n ? 'جمع (دینا ہے)' : 'برابر';

        return [
          idx + 1,
          k.code,
          k.name,
          k.mobile || '—',
          k.address || '—',
          k.currency === 'aed' ? 'درہم (AED)' : 'روپیہ (PKR)',
          { number: minorToDecimalString(absVal) },
          side
        ];
      });

      const absDisplayed = displayedNet < 0n ? -displayedNet : displayedNet;
      const netSide = displayedNet > 0n ? 'بنام (خالص لینا ہے)' : displayedNet < 0n ? 'جمع (خالص دینا ہے)' : 'برابر';

      const rows = [
        ['کسٹمرز کھاتے رپورٹ — Hisaab App'],
        ['رپورٹ کی نوعیت', reportType],
        ['تاریخ رپورٹ', getToday(), 'وقت', new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })],
        ['کل ریکارڈز', filtered.length],
        [],
        ['نمبر شمار', 'کھاتہ کوڈ', 'گاہک یا پارٹی کا نام', 'موبائیل نمبر', 'پتہ / مقام', 'کرنسی', 'بقایا بیلنس', 'نوعیت'],
        ...dataRows,
        [],
        ['', '', 'کل میزان (Total)', '', '', '', { number: minorToDecimalString(absDisplayed) }, netSide]
      ];

      exportSheet(rows, `کسٹمرز_کھاتے_${filterSlug}_${getToday()}.xlsx`);
    }

    async function print(options = {}) {
      const isDirectory = $('khata-directory-view') && !$('khata-directory-view').hidden;
      if (isDirectory) {
        return printDirectoryReport(options);
      }
      return printKhata(options);
    }

    function exportExcel() {
      const isDirectory = $('khata-directory-view') && !$('khata-directory-view').hidden;
      if (isDirectory) {
        return exportDirectoryExcel();
      }
      return exportKhataExcel();
    }

    function syncNavButtons(khataView) {
      const btnReg = $('view-register');
      const btnJrn = $('view-journal');
      const btnKht = $('view-khata');

      const isJournal = !khataView && document.body.classList.contains('journal-view');
      const isRegister = !khataView && !isJournal;

      if (btnReg) {
        btnReg.classList.toggle('active', isRegister);
        btnReg.setAttribute('aria-pressed', String(isRegister));
        btnReg.setAttribute('aria-selected', String(isRegister));
      }
      if (btnJrn) {
        btnJrn.classList.toggle('active', isJournal);
        btnJrn.setAttribute('aria-pressed', String(isJournal));
        btnJrn.setAttribute('aria-selected', String(isJournal));
      }
      if (btnKht) {
        btnKht.classList.toggle('active', khataView);
        btnKht.setAttribute('aria-pressed', String(khataView));
        btnKht.setAttribute('aria-selected', String(khataView));
      }
    }

    function setPage(khataView, options = {}) {
      document.body.classList.toggle('khata-view', khataView);
      if (khataView) {
        document.body.classList.remove('journal-view');
      }

      const reg = $('register-page');
      const jrn = $('journal-page');
      const kht = $('khata-page');

      if (reg) reg.hidden = khataView ? true : document.body.classList.contains('journal-view');
      if (jrn) jrn.hidden = khataView ? true : !document.body.classList.contains('journal-view');
      if (kht) kht.hidden = !khataView;

      syncNavButtons(khataView);

      if (khataView) {
        if (options?.screen === 'ledger' && (options?.id || activeKhataId)) {
          showLedgerView(options.id || activeKhataId);
        } else {
          showDirectoryView();
        }
      } else {
        closeDialog($('khata-directory-dialog'));
        closeDialog($('new-khata-dialog'));
        closeDialog($('edit-khata-dialog'));
      }

      try {
        if (khataView) localStorage.setItem('hisaab-workspace', 'khata');
      } catch {}
    }

    // Event Bindings
    $('view-khata')?.addEventListener('click', () => setPage(true));
    $('view-register')?.addEventListener('click', () => setPage(false));
    $('view-journal')?.addEventListener('click', () => setPage(false));

    // Dialog Close and Dismiss Handlers
    const closeDialog = d => {
      if (d && typeof d.close === 'function' && d.open) {
        d.close();
      }
    };

    $('btn-close-new-khata')?.addEventListener('click', () => closeDialog($('new-khata-dialog')));
    $('btn-cancel-new-khata')?.addEventListener('click', () => closeDialog($('new-khata-dialog')));

    $('btn-close-edit-khata')?.addEventListener('click', () => closeDialog($('edit-khata-dialog')));
    $('btn-cancel-edit-khata')?.addEventListener('click', () => closeDialog($('edit-khata-dialog')));

    $('btn-close-dir-khata')?.addEventListener('click', () => closeDialog($('khata-directory-dialog')));
    $('btn-footer-close-dir-khata')?.addEventListener('click', () => closeDialog($('khata-directory-dialog')));

    // Delegated data-close-dialog click
    document.addEventListener('click', e => {
      const btn = e.target?.closest?.('[data-close-dialog]');
      if (btn) {
        e.preventDefault();
        closeDialog(btn.closest('dialog'));
      }
    });

    // Backdrop click dismiss for all khata dialogs
    ['new-khata-dialog', 'edit-khata-dialog', 'khata-directory-dialog'].forEach(id => {
      const d = $(id);
      if (!d) return;
      d.addEventListener('click', e => {
        const rect = d.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          closeDialog(d);
        }
      });
    });

    // English Number Sanitizers on typing/pasting
    ['new-khata-mobile', 'edit-khata-mobile', 'new-khata-opening-balance'].forEach(id => {
      const el = $(id);
      if (el) {
        el.addEventListener('input', () => {
          const clean = digits(el.value);
          if (el.value !== clean) el.value = clean;
        });
      }
    });

    // Currency selector dynamic tag
    $('new-khata-currency')?.addEventListener('change', e => {
      const curTag = $('new-khata-cur-tag');
      if (curTag) curTag.textContent = e.target.value === 'aed' ? 'AED' : 'PKR';
    });

    $('btn-new-khata-top')?.addEventListener('click', openNewKhataModal);
    $('btn-new-khata-ledger')?.addEventListener('click', openNewKhataModal);
    $('btn-new-khata-empty')?.addEventListener('click', openNewKhataModal);
    $('btn-khata-directory')?.addEventListener('click', () => showDirectoryView());
    $('btn-new-khata-dir')?.addEventListener('click', () => {
      $('khata-directory-dialog')?.close();
      openNewKhataModal();
    });
    $('btn-khata-edit')?.addEventListener('click', openEditKhataModal);
    $('btn-khata-print')?.addEventListener('click', printKhata);
    $('btn-khata-excel')?.addEventListener('click', exportKhataExcel);

    // Customer Directory Action Buttons
    $('btn-khata-dir-print')?.addEventListener('click', () => printDirectoryReport());
    $('btn-khata-dir-excel')?.addEventListener('click', () => exportDirectoryExcel());

    // Receivables & Payables Category Filter Tabs
    $('tab-khata-all')?.addEventListener('click', () => setDirectoryFilter('all'));
    $('tab-khata-receivables')?.addEventListener('click', () => setDirectoryFilter('receivables'));
    $('tab-khata-payables')?.addEventListener('click', () => setDirectoryFilter('payables'));

    // Directory Overview Stat Card Clickable Filters
    ['stat-card-khata-all', 'stat-card-khata-receivables', 'stat-card-khata-payables'].forEach(id => {
      const el = $(id);
      if (!el) return;
      const targetFilter = id === 'stat-card-khata-receivables' ? 'receivables' : id === 'stat-card-khata-payables' ? 'payables' : 'all';
      el.addEventListener('click', () => setDirectoryFilter(targetFilter));
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setDirectoryFilter(targetFilter);
        }
      });
    });

    // Customer Ledger Date Filter Events
    const filterFromInput = $('khata-filter-from');
    const filterToInput = $('khata-filter-to');
    const filterTodayBtn = $('btn-khata-filter-today');
    const filterClearBtn = $('btn-khata-filter-clear');

    filterFromInput?.addEventListener('change', () => {
      const fromVal = filterFromInput.value;
      if (fromVal && (!filterToInput.value || filterToInput.value < fromVal)) {
        filterToInput.value = fromVal;
      }
      setDateFilter(filterFromInput.value, filterToInput.value);
    });

    filterToInput?.addEventListener('change', () => {
      const toVal = filterToInput.value;
      if (toVal && (!filterFromInput.value || filterFromInput.value > toVal)) {
        filterFromInput.value = toVal;
      }
      setDateFilter(filterFromInput.value, filterToInput.value);
    });

    filterTodayBtn?.addEventListener('click', () => {
      const today = getToday();
      if (filterFromInput) filterFromInput.value = today;
      if (filterToInput) filterToInput.value = today;
      setDateFilter(today, today);
    });

    filterClearBtn?.addEventListener('click', () => {
      if (filterFromInput) filterFromInput.value = '';
      if (filterToInput) filterToInput.value = '';
      setDateFilter('', '');
    });

    $('btn-khata-delete')?.addEventListener('click', () => {
      const khata = getActiveKhata();
      if (!khata) return;
      if (!confirm(`کیا آپ واقعی کھاتہ "${khata.name} (${khata.code})" حذف کرنا چاہتے ہیں؟\n\nاس کے تمام اندراجات مستقل طور پر مٹ جائیں گے۔`)) return;

      const list = getKhatas();
      const idx = list.findIndex(k => k.id === khata.id);
      if (idx !== -1) list.splice(idx, 1);
      selectKhata(null);
      save();
      showDirectoryView();
    });

    // Form Submission: New Khata
    $('new-khata-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const code = ($('new-khata-code')?.value || '').trim() || nextKhataCode();
      const name = ($('new-khata-name')?.value || '').trim();
      const mobile = digits($('new-khata-mobile')?.value || '').trim();
      const address = ($('new-khata-address')?.value || '').trim();
      const currency = $('new-khata-currency')?.value === 'aed' ? 'aed' : 'pkr';
      const openBal = parseAmount($('new-khata-opening-balance')?.value || '');
      const openType = $('new-khata-opening-type')?.value;

      if (!name) {
        alert('براہ کرم گاہک کا نام درج کریں۔');
        return;
      }
      if ($('new-khata-opening-balance')?.value.trim() && openBal === null) {
        alert('افتتاحی بقایا درست رقم میں درج کریں۔');
        return;
      }

      const list = getKhatas();
      if (list.some(k => k.code.trim().toUpperCase() === code.toUpperCase())) {
        alert('یہ کھاتہ کوڈ پہلے سے موجود ہے۔ براہ کرم دوسرا کوڈ استعمال کریں۔');
        return;
      }
      const rows = [];
      if (openBal !== null && openBal > 0n) {
        rows.push({
          id: uuid(),
          date: getToday(),
          detail: 'سابقہ بقایا (Opening Balance)',
          debit: openType === 'debit' ? formatAmount(openBal) : '',
          credit: openType === 'credit' ? formatAmount(openBal) : ''
        });
      }

      const newKhata = {
        id: uuid(),
        code,
        name,
        mobile,
        address,
        currency,
        rows
      };

      list.push(newKhata);
      save();
      $('new-khata-dialog')?.close();
      showLedgerView(newKhata.id);
    });

    // Form Submission: Edit Khata
    $('edit-khata-form')?.addEventListener('submit', e => {
      e.preventDefault();
      const khata = getActiveKhata();
      if (!khata) return;

      const code = ($('edit-khata-code')?.value || '').trim();
      const name = ($('edit-khata-name')?.value || '').trim();
      const mobile = digits($('edit-khata-mobile')?.value || '').trim();
      const address = ($('edit-khata-address')?.value || '').trim();
      const currency = $('edit-khata-currency')?.value === 'aed' ? 'aed' : 'pkr';

      if (!name) {
        alert('براہ کرم گاہک کا نام درج کریں۔');
        return;
      }

      const list = getKhatas();
      if (code && list.some(k => k.id !== khata.id && k.code.trim().toUpperCase() === code.toUpperCase())) {
        alert('یہ کھاتہ کوڈ پہلے سے کسی دوسرے گاہک کے لیے موجود ہے۔');
        return;
      }

      khata.code = code || khata.code;
      khata.name = name;
      khata.mobile = mobile;
      khata.address = address;
      if (!khata.rows.some(hasData)) khata.currency = currency;

      save();
      $('edit-khata-dialog')?.close();
      renderActiveKhata();
    });

    // Quick Search in Ledger View
    $('khata-search')?.addEventListener('input', e => {
      const q = digits(e.target.value.toLowerCase().trim());
      if (!q) return;
      const list = getKhatas();
      const match = list.find(k =>
        k.code.toLowerCase().includes(q) ||
        k.name.toLowerCase().includes(q) ||
        (k.mobile && k.mobile.includes(q)) ||
        (k.address && k.address.toLowerCase().includes(q))
      );
      if (match && match.id !== activeKhataId) {
        showLedgerView(match.id);
      }
    });

    // Directory Page Live Filter & Search
    $('khata-dir-search')?.addEventListener('input', () => {
      renderDirectory();
    });

    $('khata-dir-search')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const rows = Array.from($('khata-dir-rows')?.children || []).filter(tr => tr.onclick);
        if (rows.length === 1) {
          rows[0].click();
        }
      }
    });

    // App always opens on the Register (اندراج رجسٹر) by default; last workspace is not restored.

    return {
      isActive: () => document.body.classList.contains('khata-view'),
      setPage,
      render: () => {
        if ($('khata-directory-view') && !$('khata-directory-view').hidden) {
          renderDirectory();
        } else {
          renderActiveKhata();
        }
      },
      showDirectory: showDirectoryView,
      showLedger: showLedgerView,
      print,
      printKhata,
      printDirectory: printDirectoryReport,
      exportExcel,
      exportKhataExcel,
      exportDirectoryExcel,
      setDirectoryFilter,
      getDirectoryFilter: () => directoryFilter,
      setDateFilter,
      getDateFilter: () => ({ from: dateFilterFrom, to: dateFilterTo }),
      clearDateFilter: () => setDateFilter('', ''),
      getFilterPeriodText
    };
  }

  window.HisaabKhata = { normalize, mount };
})();
