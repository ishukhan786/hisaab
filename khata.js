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

    const getKhatas = () => {
      const state = getState();
      if (!Array.isArray(state.khatas)) state.khatas = [];
      return state.khatas;
    };

    function selectKhata(id) {
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

        if (tr) {
          tr.classList.toggle('khata-draft', isDraft);
          const sCell = tr.querySelector('.td-serial');
          if (sCell) sCell.textContent = isDraft ? '＋' : formatCount(serial++);

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
          totDebit += dVal;
          totCredit += cVal;
          running += (dVal - cVal);

          if (tr) {
            const bCell = tr.querySelector('.td-baqaya');
            if (bCell) {
              bCell.classList.remove('is-jama', 'is-banam');
              bCell.replaceChildren();
              const absVal = running < 0n ? -running : running;

              // Screen Balance Elements
              const numSpan = document.createElement('span');
              numSpan.className = 'khata-screen-bal eng-num';
              numSpan.textContent = formatAmount(absVal, { withDecimals: hasDecimals });
              bCell.append(numSpan);

              const tag = document.createElement('span');
              tag.className = 'bal-tag khata-screen-bal-tag';
              if (running > 0n) {
                bCell.classList.add('is-banam');
                tag.textContent = 'بنام (لینا ہے)';
              } else if (running < 0n) {
                bCell.classList.add('is-jama');
                tag.textContent = 'جمع (دینا ہے)';
              } else {
                tag.textContent = 'برابر ✓';
              }
              bCell.append(tag);

              // Clean Print Balance with right-aligned amount and left-aligned side label
              const printBal = document.createElement('span');
              printBal.className = 'khata-print-val khata-print-bal';

              const amtSpan = document.createElement('span');
              amtSpan.className = 'khata-bal-amount eng-num';
              amtSpan.textContent = formatAmount(absVal, { withDecimals: hasDecimals });

              const sideSpan = document.createElement('span');
              sideSpan.className = 'khata-bal-side';
              sideSpan.textContent = running > 0n ? 'بنام' : running < 0n ? 'جمع' : 'برابر';

              printBal.append(amtSpan, sideSpan);
              bCell.append(printBal);
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

      // Update print summary snapshot if element exists
      const sumSabqaEl = $('khata-print-sum-sabqa');
      if (sumSabqaEl && khata) {
        let sabqaAmount = 0n;
        let sabqaHasDec = false;
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
        sumSabqaEl.textContent = formatAmount(sabqaAmount, { withDecimals: sabqaHasDec || hasDecimals });
      }
    }

    /**
     * Constructs and appends a single row element into the ledger table.
     * @param {object} r
     * @param {object} khata
     */
    function addRowNode(r, khata) {
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
        save();
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
          save();
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
          save();
        } else {
          inBanam.classList.remove('is-invalid');
          inBanam.value = '';
          printBanam.textContent = '';
          r.debit = '';
          recalculate(khata);
          save();
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
          save();
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
          save();
        } else {
          inJama.classList.remove('is-invalid');
          inJama.value = '';
          printJama.textContent = '';
          r.credit = '';
          recalculate(khata);
          save();
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
        khata.rows = khata.rows.filter(x => x.id !== r.id);
        rowNodes.delete(r.id);
        tr.remove();
        ensureDraft(khata, { appendNode: true });
        recalculate(khata);
        save();
      };
      tdDelete.append(btnDel);
      tr.append(tdDelete);

      $('khata-rows').append(tr);
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

      for (const r of khata.rows) {
        addRowNode(r, khata);
      }

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

      let totBanam = 0n;
      let totJama = 0n;
      let hasAnyDec = false;

      if (!list.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'summary-empty-cell';
        td.style.padding = '42px 20px';
        td.style.textAlign = 'center';

        const p = document.createElement('p');
        p.textContent = 'ابھی کوئی کھاتہ موجود نہیں ہے۔';
        p.style.marginBottom = '14px';
        p.style.fontSize = '1.1rem';
        p.style.color = '#527766';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-khata-new';
        btn.textContent = '＋ نیا گاہک کھاتہ بنائیں';
        btn.onclick = openNewKhataModal;

        td.append(p, btn);
        tr.append(td);
        tbody.append(tr);
      } else {
        list.forEach((k, idx) => {
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
              totBanam += nd;
              totJama += nc;
            }
          }
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
          tdBal.className = 'eng-num';
          tdBal.style.fontWeight = '700';
          tdBal.style.direction = 'ltr';
          tdBal.textContent = `${formatAmount(absVal, { withDecimals: hasDec })} ${running > 0n ? 'بنام' : running < 0n ? 'جمع' : 'برابر'}`;
          tdBal.style.color = running > 0n ? '#dc2626' : running < 0n ? '#059669' : '#174233';

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
          tbody.append(tr);
        });
      }

      // Update Directory Overview Stats
      const statCount = $('khata-dir-total-count');
      const statBanam = $('khata-dir-total-banam');
      const statJama = $('khata-dir-total-jama');
      const statNet = $('khata-dir-net-balance');
      const statBox = $('khata-dir-stat-balance-box');
      const statStatus = $('khata-dir-balance-status');
      const countEl = $('khata-dir-count');

      if (statCount) statCount.textContent = formatCount(list.length);
      if (statBanam) statBanam.textContent = formatAmount(totBanam, { withDecimals: hasAnyDec });
      if (statJama) statJama.textContent = formatAmount(totJama, { withDecimals: hasAnyDec });

      const netTotal = totBanam - totJama;
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

      if (countEl) {
        countEl.textContent = `کل کھاتے: ${formatCount(list.length)}`;
      }
    }

    function showDirectoryView() {
      const dirView = $('khata-directory-view');
      const ledView = $('khata-ledger-view');
      if (dirView) dirView.hidden = false;
      if (ledView) ledView.hidden = true;

      renderDirectory();

      const dirSearch = $('khata-dir-search');
      if (dirSearch) {
        dirSearch.value = '';
        setTimeout(() => dirSearch.focus(), 60);
      }
    }

    function showLedgerView(id) {
      if (id) selectKhata(id);
      const dirView = $('khata-directory-view');
      const ledView = $('khata-ledger-view');
      if (dirView) dirView.hidden = true;
      if (ledView) ledView.hidden = false;

      renderActiveKhata();

      setTimeout(() => {
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

      // Legacy test hooks
      const titleEl = $('khata-print-customer');
      const metaEl = $('khata-print-meta');
      if (titleEl) titleEl.textContent = `${khata.name} (${khata.code})`;
      if (metaEl) {
        metaEl.textContent = `موبائیل: ${khata.mobile || '—'} | مقام: ${khata.address || '—'} | کرنسی: ${khata.currency === 'aed' ? 'درہم' : 'روپیہ'} | تاریخ پرنٹ: ${getToday()}`;
      }

      // Populate Official Bank Statement Dossier
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      const dateStr = formatDisplayDate(getToday());

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

      // Financial Summary in Dossier
      let totD = 0n;
      let totC = 0n;
      let hasDec = false;
      for (const r of khata.rows) {
        if (hasData(r)) {
          const nd = parseAmount(r.debit);
          const nc = parseAmount(r.credit);
          if (nd !== null) { totD += nd; if (nd % 100n !== 0n) hasDec = true; }
          if (nc !== null) { totC += nc; if (nc % 100n !== 0n) hasDec = true; }
        }
      }
      const net = totD - totC;
      const absNet = net < 0n ? -net : net;

      // Sabqa (Opening) Balance
      let sabqaAmount = 0n;
      let sabqaHasDec = false;
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

      const sumSabqaEl = $('khata-print-sum-sabqa');
      const sumBanamEl = $('khata-print-sum-banam');
      const sumJamaEl = $('khata-print-sum-jama');
      const sumBalEl = $('khata-print-sum-balance');
      const sumStatEl = $('khata-print-sum-status');

      if (sumSabqaEl) sumSabqaEl.textContent = formatAmount(sabqaAmount, { withDecimals: sabqaHasDec || hasDec });
      if (sumBanamEl) sumBanamEl.textContent = formatAmount(totD, { withDecimals: hasDec });
      if (sumJamaEl) sumJamaEl.textContent = formatAmount(totC, { withDecimals: hasDec });
      if (sumBalEl) sumBalEl.textContent = formatAmount(absNet, { withDecimals: hasDec });

      if (sumStatEl) {
        if (net > 0n) {
          sumStatEl.textContent = 'خالص بقایا (بنام - قابلِ وصول / لینا ہے)';
        } else if (net < 0n) {
          sumStatEl.textContent = 'خالص بقایا (جمع - واجب الادا / دینا ہے)';
        } else {
          sumStatEl.textContent = 'خالص بقایا (حساب برابر ✓)';
        }
      }

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

      // In Electron desktop environment, use previewPDF for flawless native preview
      if (window.electronAPI?.previewPDF) {
        if (document.body.inert) { restoreTheme?.(); return; }
        document.body.inert = true;
        try {
          const safeName = (khata.name || 'کھاتہ').replace(/[<>:"/\\|?*]/g, '_');
          const fileName = `لیجر_${safeName}_${getToday()}.pdf`;
          const result = options?.savePDF && window.electronAPI?.savePDF
            ? await window.electronAPI.savePDF(fileName)
            : await window.electronAPI.previewPDF();
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

      let bal = 0n;
      let totD = 0n;
      let totC = 0n;
      const validRows = khata.rows.filter(hasData);
      const hasDec = validRows.some(r => {
        const nd = parseAmount(r.debit) || 0n;
        const nc = parseAmount(r.credit) || 0n;
        return nd % 100n !== 0n || nc % 100n !== 0n;
      });

      const dataRows = validRows.map((r, i) => {
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
        return [i + 1, r.date, r.detail, debitCell, creditCell, balLabel];
      });

      const currencyName = khata.currency === 'aed' ? 'اماراتی درہم (AED)' : 'پاکستانی روپیہ (PKR)';
      const netBalAbs = bal < 0n ? -bal : bal;
      const rows = [
        ['گاہک کھاتہ لیجر — Hisaab App'],
        ['گاہک کا نام', khata.name, 'کھاتہ کوڈ', khata.code],
        ['موبائیل نمبر', khata.mobile || '—', 'پتہ / مقام', khata.address || '—'],
        ['کرنسی', currencyName, 'تاریخ رپورٹ', getToday()],
        [],
        ['نمبر شمار', 'تاریخ', 'تفصیل', `بنام (${khata.currency.toUpperCase()})`, `جمع (${khata.currency.toUpperCase()})`, 'بقایا'],
        ...dataRows,
        [],
        ['', 'کل میزان', '', { number: minorToDecimalString(totD) }, { number: minorToDecimalString(totC) }, `${formatAmount(netBalAbs, { withDecimals: hasDec })} ${bal > 0n ? 'بنام' : bal < 0n ? 'جمع' : 'برابر'}`]
      ];

      exportSheet(rows, `کھاتہ_${khata.code}_${khata.name}_${getToday()}.xlsx`);
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
      }
      if (btnJrn) {
        btnJrn.classList.toggle('active', isJournal);
        btnJrn.setAttribute('aria-pressed', String(isJournal));
      }
      if (btnKht) {
        btnKht.classList.toggle('active', khataView);
        btnKht.setAttribute('aria-pressed', String(khataView));
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
    if ($('view-khata')) $('view-khata').onclick = () => setPage(true);
    $('view-khata')?.addEventListener('click', () => setPage(true));

    document.addEventListener('click', e => {
      if (e.target?.closest?.('#view-khata')) {
        setPage(true);
      } else if (e.target?.closest?.('#view-register')) {
        setPage(false);
      } else if (e.target?.closest?.('#view-journal')) {
        setPage(false);
      }
    });

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

    // Directory Page Live Filter
    $('khata-dir-search')?.addEventListener('input', e => {
      const q = digits(e.target.value.toLowerCase().trim());
      const rows = $('khata-dir-rows')?.children;
      if (!rows) return;
      let visible = 0;
      for (const tr of rows) {
        if (!q) {
          tr.hidden = false;
          visible++;
        } else {
          const text = tr.textContent.toLowerCase();
          const match = text.includes(q);
          tr.hidden = !match;
          if (match) visible++;
        }
      }
      const countEl = $('khata-dir-count');
      if (countEl) {
        countEl.textContent = q
          ? `نتائج: ${formatCount(visible)} / ${formatCount(rows.length)}`
          : `کل کھاتے: ${formatCount(rows.length)}`;
      }
    });

    $('khata-dir-search')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const rows = Array.from($('khata-dir-rows')?.children || []).filter(tr => !tr.hidden && tr.onclick);
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
      print: printKhata,
      exportExcel: exportKhataExcel
    };
  }

  window.HisaabKhata = { normalize, mount };
})();
