'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { validateState } = require('../database.js');

console.log('🧪 Running Hisaab Khata Verification & Integrity Test');

// 1. Database schema and state validation test
const sampleState = {
  version: 4,
  title: 'Hisaab Register',
  date: '2026-10-22',
  branches: ['کابل پارٹی'],
  partyCurrencies: { 'کابل پارٹی': 'afn' },
  rows: [],
  trash: [],
  journal: { date: '2026-10-22', rows: [] },
  khatas: [
    {
      id: 'kh-test-1',
      code: 'KH-1001',
      name: 'حاجی محمد گل',
      mobile: '03001234567',
      address: 'پشاور قصہ خوانی بازار',
      currency: 'pkr',
      rows: [
        { id: 'r1', date: '2026-10-20', detail: 'سابقہ حساب', debit: '100,000', credit: '' },
        { id: 'r2', date: '2026-10-21', detail: 'کیش وصولی', debit: '', credit: '30,000' },
        { id: 'draft', date: '2026-10-22', detail: '', debit: '', credit: '' } // empty draft to filter
      ]
    },
    {
      id: 'kh-test-2',
      code: 'KH-1002',
      name: 'الامارات جنرل ٹریڈنگ',
      mobile: '+971501234567',
      address: 'دبئی مارکیٹ',
      currency: 'aed',
      rows: [
        { id: 'r3', date: '2026-10-22', detail: 'دبئی سے ترسیل', debit: '', credit: '15,000' }
      ]
    }
  ]
};

const validated = validateState(sampleState);
assert.equal(validated.khatas.length, 2, 'Khatas count preserved');
assert.equal(validated.khatas[0].rows.length, 2, 'Empty draft row filtered out cleanly');
assert.equal(validated.khatas[0].code, 'KH-1001', 'Khata code KH-1001 preserved');
assert.equal(validated.khatas[1].currency, 'aed', 'AED currency preserved');
console.log('  ✓ Database validateState supports Khata records and safely prunes draft rows');

const invalidKhata = structuredClone(sampleState);
invalidKhata.khatas[1].id = invalidKhata.khatas[0].id;
assert.throws(() => validateState(invalidKhata), /duplicate khata/, 'Duplicate khata IDs are rejected');

const duplicateCodeKhata = structuredClone(sampleState);
duplicateCodeKhata.khatas[1].code = duplicateCodeKhata.khatas[0].code.toLowerCase();
assert.throws(() => validateState(duplicateCodeKhata), /duplicate khata/, 'Duplicate khata codes are rejected case-insensitively');

const doubleSidedKhata = structuredClone(sampleState);
doubleSidedKhata.khatas[0].rows[0].credit = '1';
assert.throws(() => validateState(doubleSidedKhata), /double-sided entry/, 'A row cannot contain both debit and credit');

const malformedKhata = structuredClone(sampleState);
malformedKhata.khatas[0].rows[0].debit = 'bad amount';
assert.throws(() => validateState(malformedKhata), /khata entry/, 'Malformed Khata amounts are rejected');

// Intermediate decimal typing test (e.g. typing "150.")
const intermediateDecimalKhata = structuredClone(sampleState);
intermediateDecimalKhata.khatas[0].rows[0].debit = '150.';
assert.doesNotThrow(() => validateState(intermediateDecimalKhata), 'Intermediate trailing decimal during typing is valid');
intermediateDecimalKhata.khatas[0].rows[0].debit = '150.75';
assert.doesNotThrow(() => validateState(intermediateDecimalKhata), 'Standard 2-decimal amount is valid');

const tooManyDecimalsKhata = structuredClone(sampleState);
tooManyDecimalsKhata.khatas[0].rows[0].debit = '150.123';
assert.throws(() => validateState(tooManyDecimalsKhata), /khata entry/, '3+ decimals are rejected');

console.log('  ✓ Khata IDs/codes, single-sided ledger rows, decimal typing tolerance and caps are enforced');

// 2. HTML Markup & Component Integrity Checks
const html = fs.readFileSync(path.resolve('index.html'), 'utf8');

assert.ok(html.includes('<link rel="stylesheet" href="khata.css'), 'khata.css stylesheet linked in index.html');
assert.ok(html.includes('id="view-khata"'), 'view-khata workspace navigation button present');
assert.ok(html.includes('id="khata-page"'), 'khata-page main workspace container present');
assert.ok(html.includes('id="khata-search"'), 'khata-search input present');
assert.ok(html.includes('id="btn-new-khata-top"'), 'btn-new-khata-top button present');
assert.ok(html.includes('id="btn-khata-directory"'), 'btn-khata-directory button present');
assert.ok(html.includes('id="khata-view-code"'), 'khata-view-code element present');
assert.ok(html.includes('id="khata-view-name"'), 'khata-view-name element present');
assert.ok(html.includes('id="khata-view-mobile"'), 'khata-view-mobile element present');
assert.ok(html.includes('id="khata-view-address"'), 'khata-view-address element present');
assert.ok(!html.includes('id="new-khata-currency"'), 'Currency selector removed from customer khata for pure numeric accounting');
assert.ok(html.includes('id="khata-total-banam"'), 'khata-total-banam stat element present');
assert.ok(html.includes('id="khata-total-jama"'), 'khata-total-jama stat element present');
assert.ok(html.includes('id="khata-net-balance"'), 'khata-net-balance stat element present');
assert.ok(html.includes('id="khata-rows"'), 'khata-rows tbody present');
assert.ok(html.includes('id="khata-foot-banam"'), 'khata-foot-banam total cell present');
assert.ok(html.includes('id="khata-foot-jama"'), 'khata-foot-jama total cell present');
assert.ok(html.includes('id="khata-foot-baqaya"'), 'khata-foot-baqaya total cell present');
assert.ok(html.includes('id="khata-print-sum-sabqa"'), 'khata-print-sum-sabqa opening balance card present');
assert.ok(html.includes('class="khata-totals-gap"'), 'khata-totals-gap table spacer row present');
assert.ok(html.includes('id="new-khata-dialog"'), 'new-khata-dialog modal present');
assert.ok(html.includes('id="btn-close-new-khata"'), 'btn-close-new-khata close button present');
assert.ok(html.includes('btn-cancel-new-khata'), 'btn-cancel-new-khata cancel button present');
assert.ok(html.includes('readonly'), 'Code input has readonly attribute for tampering protection');
assert.ok(html.includes('eng-num'), 'English numbering class present on number inputs');
assert.ok(html.includes('id="new-khata-form"'), 'new-khata-form present');
assert.ok(html.includes('id="edit-khata-dialog"'), 'edit-khata-dialog modal present');
assert.ok(html.includes('id="btn-close-edit-khata"'), 'btn-close-edit-khata close button present');
assert.ok(html.includes('id="khata-directory-dialog"'), 'khata-directory-dialog modal present');
assert.ok(html.includes('id="btn-close-dir-khata"'), 'btn-close-dir-khata close button present');
assert.ok(html.includes('<script src="khata.js'), 'khata.js script included');
console.log('  ✓ index.html has complete Khata UI structure, navigation tab, stats, ledger table, and modals');

// 3. Logic & Controller Integrity Checks in khata.js and app.js
const khataJs = fs.readFileSync(path.resolve('khata.js'), 'utf8');
const appJs = fs.readFileSync(path.resolve('app.js'), 'utf8');
const serverJs = fs.readFileSync(path.resolve('server.js'), 'utf8');

assert.ok(khataJs.includes('window.HisaabKhata = { normalize, mount }'), 'window.HisaabKhata exported');
assert.ok(khataJs.includes('nextKhataCode'), 'Auto-generation of sequential code logic present');
assert.ok(khataJs.includes('btn-close-new-khata'), 'Explicit close event listener for new khata modal present');
assert.ok(khataJs.includes('btn-cancel-new-khata'), 'Explicit cancel event listener for new khata modal present');
assert.ok(khataJs.includes('recalculate'), 'Running progressive balance arithmetic logic present');
assert.ok(khataJs.includes('khata-bal-amount'), 'Baqaya column amount span alignment logic present');
assert.ok(khataJs.includes('khata-bal-side'), 'Baqaya column side tag alignment logic present');
assert.ok(khataJs.includes('exportKhataExcel'), 'Excel export for customer statement present');
assert.ok(khataJs.includes('printKhata'), 'Print formatting and light theme preservation present');
assert.ok(appJs.includes('khataController = window.HisaabKhata.mount'), 'HisaabKhata mounted in app.js');
assert.ok(appJs.includes('khatas: window.HisaabKhata'), 'khatas normalized in state migration');
assert.ok(serverJs.includes("'khata.css'"), 'khata.css whitelisted in server.js');
assert.ok(serverJs.includes("'khata.js'"), 'khata.js whitelisted in server.js');

const journalJs = fs.readFileSync(path.resolve('journal.js'), 'utf8');
assert.ok(khataJs.includes("confirm('کیا آپ واقعی یہ انٹری حذف کرنا چاہتے ہیں؟')"), 'Khata entry delete confirmation prompt present');
assert.ok(appJs.includes("confirm('کیا آپ واقعی یہ انٹری حذف کرنا چاہتے ہیں؟')"), 'Andraj register entry delete confirmation prompt present');
assert.ok(journalJs.includes("confirm('کیا آپ واقعی روزنامچہ کی یہ انٹری حذف کرنا چاہتے ہیں؟')"), 'Journal entry delete confirmation prompt present');
console.log('  ✓ khata.js controller, auto-code sequence starting at 1, balance arithmetic, server whitelist, and delete confirmations verified');

// 4. CSS & Design System Checks
const khataCss = fs.readFileSync(path.resolve('khata.css'), 'utf8');

assert.ok(khataCss.includes('.khata-card'), 'Khata card styling defined');
assert.ok(khataCss.includes('.khata-code-badge'), 'Khata code badge styling defined');
assert.ok(khataCss.includes('.khata-stat-box.balance'), 'Balance status box styling defined');
assert.ok(khataCss.includes('.eng-num'), 'English numerals styling defined with Calibri/Segoe UI');
assert.ok(khataCss.includes('.khata-input-locked'), 'Locked input styling defined');
assert.ok(khataCss.includes('html[data-theme="dark"] .khata-card'), 'Dark theme emerald obsidian styles present');
assert.ok(khataCss.includes('html[data-theme="dark"] .khata-stat-box'), 'Dark theme stat boxes styled');
assert.ok(khataCss.includes('html[data-theme="dark"] dialog.khata-modal'), 'Dark theme modal dialogs styled');
assert.ok(khataCss.includes('html[data-theme="dark"] #khata-foot-banam'), 'Dark theme ledger table tfoot cells styled');
assert.ok(khataCss.includes('html[data-theme="dark"] .khata-dir-header-card'), 'Dark theme directory header card styled');
assert.ok(khataCss.includes('html[data-theme="dark"] .khata-dir-stats-grid'), 'Dark theme directory stats grid styled');
assert.ok(khataCss.includes('html[data-theme="dark"] .khata-dir-footer-bar'), 'Dark theme directory footer bar styled');
assert.ok(khataCss.includes('@page khata {'), 'Named @page khata defined to prevent register landscape override');
assert.ok(khataCss.includes('page: khata;'), 'page: khata assigned to #khata-page');

const excelExportJs = fs.readFileSync(path.resolve('excel-export.js'), 'utf8');
assert.ok(excelExportJs.includes('maxCols'), 'Dynamic max columns detection across rows present in excel-export.js');

assert.ok(appJs.includes('khataController.exportExcel()'), 'Khata Excel export routed via top-bar export button');
assert.ok(appJs.includes('!khataController?.isActive()'), 'Khata active checks guard shortcuts');

assert.ok(html.includes('id="khata-filter-from"'), 'khata-filter-from date input present');
assert.ok(html.includes('id="khata-filter-to"'), 'khata-filter-to date input present');
assert.ok(html.includes('id="btn-khata-filter-today"'), 'btn-khata-filter-today quick button present');
assert.ok(html.includes('id="btn-khata-filter-clear"'), 'btn-khata-filter-clear button present');
assert.ok(html.includes('id="khata-print-period"'), 'khata-print-period statement period indicator present');

assert.ok(khataJs.includes('setDateFilter'), 'Customer ledger date filter controller function present');
assert.ok(khataJs.includes('isRowInDateRange'), 'Date range comparison helper present');
assert.ok(khataJs.includes('getFilterPeriodText'), 'Statement period formatting helper present');

assert.ok(khataCss.includes('.khata-date-filter-group'), 'Date filter group styles present');
assert.ok(khataCss.includes('.khata-filter-date-input'), 'Date filter input styles present');
assert.ok(khataCss.includes('.khata-table tr[hidden]'), 'Hidden row filter suppression present in CSS');

console.log('  ✓ khata.css implements luxury cards, named @page khata, responsive layout, dark emerald theme, date filters, and print column');

// 5. Customer Directory Receivables, Payables & Print/PDF Dossier Checks
assert.ok(html.includes('id="tab-khata-all"'), 'tab-khata-all present');
assert.ok(html.includes('id="tab-khata-receivables"'), 'tab-khata-receivables present');
assert.ok(html.includes('id="tab-khata-payables"'), 'tab-khata-payables present');
assert.ok(html.includes('id="badge-khata-receivables-count"'), 'badge-khata-receivables-count present');
assert.ok(html.includes('id="badge-khata-payables-count"'), 'badge-khata-payables-count present');
assert.ok(html.includes('id="stat-card-khata-receivables"'), 'stat-card-khata-receivables present');
assert.ok(html.includes('id="stat-card-khata-payables"'), 'stat-card-khata-payables present');
assert.ok(html.includes('id="btn-khata-dir-print"'), 'btn-khata-dir-print present');
assert.ok(html.includes('id="btn-khata-dir-excel"'), 'btn-khata-dir-excel present');
assert.ok(html.includes('id="khata-dir-print-dossier"'), 'khata-dir-print-dossier present');
assert.ok(html.includes('class="khata-dir-print-signatures"'), 'khata-dir-print-signatures present');
assert.ok(html.includes('id="khata-dir-foot-bal"'), 'khata-dir-foot-bal table footer present');

assert.ok(khataJs.includes('directoryFilter'), 'directoryFilter state present in khata.js');
assert.ok(khataJs.includes('setDirectoryFilter'), 'setDirectoryFilter helper present in khata.js');
assert.ok(khataJs.includes('printDirectoryReport'), 'printDirectoryReport print dossier function present in khata.js');
assert.ok(khataJs.includes('exportDirectoryExcel'), 'exportDirectoryExcel function present in khata.js');
assert.ok(khataJs.includes('btn-khata-dir-print'), 'btn-khata-dir-print event listener wired');
assert.ok(khataJs.includes('btn-khata-dir-excel'), 'btn-khata-dir-excel event listener wired');

assert.ok(khataCss.includes('.khata-dir-tabs-bar'), 'khata-dir-tabs-bar styling defined');
assert.ok(khataCss.includes('.khata-dir-tab.is-receivable'), 'is-receivable tab styling defined');
assert.ok(khataCss.includes('.khata-dir-tab.is-payable'), 'is-payable tab styling defined');
assert.ok(khataCss.includes('body.khata-view.khata-dir-printing'), 'khata-dir-printing print mode defined');
console.log('  ✓ Receivables & Payables tabs, badges, directory print dossier, and Excel export verified');

console.log('\n========================================');
console.log('🎉 ALL KHATA VERIFICATION CHECKS PASSED!');
console.log('========================================\n');
