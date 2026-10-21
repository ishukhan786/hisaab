'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

console.log('🧪 Running Dark Mode / Theme Validation Test');

const html = fs.readFileSync(path.resolve('index.html'), 'utf8');
const uiJs = fs.readFileSync(path.resolve('ui.js'), 'utf8');
const uiCss = fs.readFileSync(path.resolve('ui.css'), 'utf8');

// 1. HTML markup & Meta checks
assert.ok(html.includes('<meta name="color-scheme" content="light dark">'), 'Meta color-scheme present');
assert.ok(html.includes('id="meta-theme-color"'), 'Meta theme-color present');
assert.ok(html.includes('id="theme-toggle"'), 'Theme toggle button present in top navigation');
assert.ok(html.includes('id="menu-theme-toggle"'), 'Theme toggle option present in More menu');
assert.ok(html.includes('localStorage.getItem(\'hisaab-theme\')'), 'Anti-FOUC script present in head');
console.log('  ✓ index.html has complete meta, anti-FOUC script, and theme toggle buttons');

// 2. JS Controller checks
assert.ok(uiJs.includes('function updateThemeUI'), 'updateThemeUI function defined');
assert.ok(uiJs.includes('function applyTheme'), 'applyTheme function defined');
assert.ok(uiJs.includes('function toggleTheme'), 'toggleTheme function defined');
assert.ok(uiJs.includes('moon:'), 'Moon icon defined in SVG icons');
assert.ok(uiJs.includes('sun:'), 'Sun icon defined in SVG icons');
assert.ok(uiJs.includes('Alt+T') || uiJs.includes('altKey'), 'Alt+T keyboard shortcut bound');
assert.ok(uiJs.includes('storage'), 'Storage event listener bound for cross-tab sync');
console.log('  ✓ ui.js includes complete theme logic, icons, shortcuts, and cross-tab sync');

// 3. CSS checks
assert.ok(uiCss.includes('color-scheme: light dark;'), 'color-scheme property declared on :root');
assert.ok(uiCss.includes('html[data-theme="dark"]'), 'Dark theme selector present in ui.css');
assert.ok(uiCss.includes('html[data-theme="dark"] body.app-shell'), 'Dark theme body background styled');
assert.ok(uiCss.includes('html[data-theme="dark"] .app-shell .paper'), 'Dark theme register paper styled');
assert.ok(uiCss.includes('html[data-theme="dark"] .app-shell #rows > tr > td'), 'Dark theme register table cells styled');
assert.ok(uiCss.includes('html[data-theme="dark"] .app-shell #rows tr:focus-within > td'), 'Dark theme focus-within table cells styled');
assert.ok(uiCss.includes('html[data-theme="dark"] .app-shell #rows tr.draft-row > td'), 'Dark theme draft-row table cells styled');
assert.ok(uiCss.includes('html[data-theme="dark"] tfoot.register-totals .totals-row > th'), 'Dark theme totals row cells styled');
assert.ok(uiCss.includes('html[data-theme="dark"] .place-suggest-menu'), 'Dark theme place suggest menu styled');
assert.ok(uiCss.includes('html[data-theme="dark"] .journal-table td'), 'Dark theme journal table cells styled');
assert.ok(uiCss.includes('html[data-theme="dark"] .journal-card'), 'Dark theme journal card styled');
assert.ok(uiCss.includes('html[data-theme="dark"] .pin-lock-card'), 'Dark theme PIN lock card styled');
assert.ok(uiCss.includes('@media print'), 'Print rules preserved');
console.log('  ✓ ui.css contains deep emerald obsidian styles for all components, rows, cells, and totals');

console.log('🎉 All dark mode verifications passed successfully!\n');
