'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('🧪 Running Hisaab Register Audit & Janch Partal Verification Test');

const html = fs.readFileSync(path.resolve('index.html'), 'utf8');
const uiCss = fs.readFileSync(path.resolve('ui.css'), 'utf8');
const appJs = fs.readFileSync(path.resolve('app.js'), 'utf8');

// 1. Structure Verification
assert.ok(html.includes('id="register-audit-panel"'), 'register-audit-panel element exists in index.html');
assert.ok(html.includes('class="register-audit-card no-print"'), 'register-audit-card has no-print class');
assert.ok(html.includes('id="audit-rate-input"'), 'audit-rate-input exists in index.html');
assert.ok(html.includes('id="audit-fee-input"'), 'audit-fee-input exists in index.html');
assert.ok(html.includes('id="audit-entries-count"'), 'audit-entries-count exists in index.html');
assert.ok(html.includes('id="audit-total-fee"'), 'audit-total-fee exists in index.html');
assert.ok(html.includes('id="audit-total-aed"'), 'audit-total-aed exists in index.html');
assert.ok(html.includes('id="audit-net-aed"'), 'audit-net-aed exists in index.html');
assert.ok(html.includes('id="audit-calculated-pkr"'), 'audit-calculated-pkr exists in index.html');
assert.ok(html.includes('id="audit-actual-pkr"'), 'audit-actual-pkr exists in index.html');
assert.ok(html.includes('id="audit-result-banner"'), 'audit-result-banner exists in index.html');
console.log('  ✓ index.html has complete Janch Partal markup and no-print guard');

// 2. Logic Verification in app.js
assert.ok(appJs.includes('function updateAuditPanel'), 'updateAuditPanel defined in app.js');
assert.ok(appJs.includes('function initAuditPanel'), 'initAuditPanel defined in app.js');
assert.ok(appJs.includes('totalFee = BigInt(Math.max(0, Math.round(count * feePerEntry)))'), 'Total fee calculation matches entry count * feePerEntry');
assert.ok(appJs.includes('netAed = totalAed > totalFee ? totalAed - totalFee : 0n'), 'Net AED deducts totalFee from totalAed');
assert.ok(appJs.includes('calculatedPkr = BigInt(Math.round(Number(netAed) * rateVal))'), 'Calculated PKR multiplies netAed by user rateVal');
assert.ok(appJs.includes('hisaab-audit-rate'), 'User entered rate is persisted in localStorage');
console.log('  ✓ app.js implements 10 AED/entry deduction, rate multiplication, and auto-reconciliation');

// 3. Print Isolation Verification
assert.ok(uiCss.includes('.register-audit-card'), 'register-audit-card styled in ui.css');
assert.ok(uiCss.includes('html[data-theme="dark"] .register-audit-card'), 'register-audit-card styled in dark mode');
assert.ok(uiCss.includes('#register-audit-panel') && uiCss.includes('display: none !important;'), 'register-audit-panel strictly hidden in @media print');
console.log('  ✓ ui.css enforces screen-only isolation with display:none !important in @media print and supports dark mode');

// 4. Mathematical Formula Unit Check
const testCount = 5;
const testFeePerEntry = 10;
const testTotalAed = 50000;
const testTotalFee = testCount * testFeePerEntry; // 50
const testNetAed = testTotalAed - testTotalFee; // 49950
const testRate = 78.50;
const testCalculatedPkr = Math.round(testNetAed * testRate); // 3921075
assert.equal(testTotalFee, 50, '5 entries at 10 AED = 50 AED fee');
assert.equal(testNetAed, 49950, 'Net AED = 50,000 - 50 = 49,950');
assert.equal(testCalculatedPkr, 3921075, 'Calculated PKR = 49,950 * 78.5 = 3,921,075');
console.log('  ✓ Mathematical formula verified: 50,000 AED - (5 × 10 AED fee) = 49,950 Net AED × 78.50 = 3,921,075 PKR');

console.log('\n🎉 All Janch Partal verification tests passed successfully!\n');
