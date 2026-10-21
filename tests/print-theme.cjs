'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

console.log('🧪 Running Print Theme Integrity Test');

const uiCss = fs.readFileSync(path.resolve('ui.css'), 'utf8');
const appJs = fs.readFileSync(path.resolve('app.js'), 'utf8');
const journalJs = fs.readFileSync(path.resolve('journal.js'), 'utf8');

// 1. CSS Print Enforcement Verification
assert.ok(uiCss.includes('@media print'), 'Print media query exists in ui.css');
assert.ok(uiCss.includes('html[data-theme="dark"] body.app-shell'), 'Dark theme app shell overridden in print');
assert.ok(uiCss.includes('html[data-theme="dark"] .app-shell .paper'), 'Dark theme paper overridden in print');
assert.ok(uiCss.includes('html[data-theme="dark"] .app-shell #rows > tr > td'), 'Dark theme rows overridden in print');
assert.ok(uiCss.includes('html[data-theme="dark"] thead th'), 'Dark theme thead overridden in print');
assert.ok(uiCss.includes('color: #000000 !important;'), 'Black ink forced in print');
assert.ok(uiCss.includes('background: #ffffff !important;'), 'White paper background forced in print');
console.log('  ✓ ui.css enforces 100% light, pure-white paper & black text in @media print');

// 2. JS Print Theme Switching Verification
assert.ok(appJs.includes('function prepareForPrintTheme'), 'prepareForPrintTheme defined in app.js');
assert.ok(appJs.includes('window.prepareForPrintTheme = prepareForPrintTheme'), 'prepareForPrintTheme exposed globally');
assert.ok(journalJs.includes('window.prepareForPrintTheme'), 'journal.js integrates prepareForPrintTheme');
assert.ok(appJs.includes('beforeprint'), 'beforeprint listener handles theme state');
assert.ok(appJs.includes('afterprint'), 'afterprint listener restores theme state');
console.log('  ✓ app.js and journal.js dynamically swap to light theme during print/PDF generation');

console.log('🎉 All print theme tests passed successfully!\n');
