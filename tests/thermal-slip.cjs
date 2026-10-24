/**
 * Hisaab - Thermal Slip Printer (80mm POS) Verification Test Suite
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('========================================');
console.log('🧾 Running Hisaab Thermal Slip Printer Verification');
console.log('========================================\n');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✕ ${name}`);
    console.error(err);
    process.exit(1);
  }
}

// 1. Module Integrity & QR Code Generation
test('thermal-print.js exists and exports HisaabThermal with pure SVG QR generator', () => {
  const filePath = path.join(__dirname, '..', 'thermal-print.js');
  assert(fs.existsSync(filePath), 'thermal-print.js must exist');
  const code = fs.readFileSync(filePath, 'utf8');
  assert(code.includes('HisaabThermal'), 'Must export HisaabThermal');
  assert(code.includes('generateMatrix'), 'Must have internal matrix generator');
  assert(code.includes('toSVG'), 'Must have SVG renderer');
  assert(code.includes('populateSlip'), 'Must have populateSlip method');
  assert(code.includes('prepareThermalOutput'), 'Must have prepareThermalOutput method');
});

test('Zero-dependency QR engine generates valid SVG for slip verification string', () => {
  // Execute thermal-print.js in a mock browser environment
  const globalWindow = {};
  const mockDoc = {
    getElementById: () => null
  };
  const code = fs.readFileSync(path.join(__dirname, '..', 'thermal-print.js'), 'utf8');
  const run = new Function('window', 'document', code);
  run(globalWindow, mockDoc);

  assert(globalWindow.HisaabThermal, 'HisaabThermal must be attached to window');
  assert(globalWindow.HisaabThermal.QRCode, 'QRCode must be available on HisaabThermal');

  const testPayload = 'HISAAB VERIFIED RECEIPT | Slip: #0012 | Date: 2026-10-25 | Party: پشاور پارٹی | Amount: 4,600,000 PKR';
  const svg = globalWindow.HisaabThermal.QRCode.toSVG(testPayload);

  assert(typeof svg === 'string', 'SVG output must be a string');
  assert(svg.startsWith('<svg'), 'Output must start with <svg');
  assert(svg.includes('viewBox="0 0'), 'SVG must include viewBox');
  assert(svg.includes('<path fill="#000"'), 'SVG must render black path modules');
  assert(svg.endsWith('</svg>'), 'SVG must close with </svg>');
});

// 2. HTML Markup & POS Slip Structure
test('index.html includes receipt switcher tabs and 80mm thermal slip markup', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert(html.includes('id="tab-receipt-standard"'), 'Standard tab button missing');
  assert(html.includes('id="tab-receipt-thermal"'), 'Thermal tab button missing');
  assert(html.includes('id="receipt-thermal-btn"'), 'Dedicated thermal print button missing');
  assert(html.includes('id="thermal-slip-paper"'), 'Thermal slip article element missing');
  assert(html.includes('id="thermal-slip-qr"'), 'QR container inside slip missing');
  assert(html.includes('data-thermal="serial"'), 'Serial data field missing');
  assert(html.includes('data-thermal="pkr"'), 'PKR amount data field missing');
  assert(html.includes('data-thermal="currency"'), 'Currency data field missing');
  assert(html.includes('thermal-print.js'), 'thermal-print.js script tag missing in HTML');
});

// 3. CSS & Print Media Rules
test('style.css defines @page thermal and body.thermal-output print rules', () => {
  const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert(styleCss.includes('@page thermal{size:80mm auto;margin:3mm 2mm}'), 'Thermal page rule missing in style.css');
  assert(styleCss.includes('body.thermal-output'), 'body.thermal-output missing in style.css');
  assert(styleCss.includes('page:thermal'), 'page:thermal assignment missing in style.css');
});

test('ui.css implements thermal slip card styling, tabs, and print overrides', () => {
  const uiCss = fs.readFileSync(path.join(__dirname, '..', 'ui.css'), 'utf8');
  assert(uiCss.includes('.receipt-tabs'), '.receipt-tabs missing in ui.css');
  assert(uiCss.includes('.thermal-slip-sheet'), '.thermal-slip-sheet missing in ui.css');
  assert(uiCss.includes('.thermal-slip-amount-card'), '.thermal-slip-amount-card missing in ui.css');
  assert(uiCss.includes('#receipt-thermal-btn'), '#receipt-thermal-btn missing in ui.css');
  assert(uiCss.includes('body.thermal-output > #receipt-print'), 'Thermal print selector missing in ui.css');
});

// 4. App Controller & PNG Copy Flow
test('app.js integrates switchReceiptTab, thermal output, and thermal PNG copying', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert(appJs.includes('switchReceiptTab'), 'switchReceiptTab function missing in app.js');
  assert(appJs.includes('outputThermalSlip'), 'outputThermalSlip function missing in app.js');
  assert(appJs.includes('HisaabThermal.populateSlip'), 'populateSlip call missing in app.js');
  assert(appJs.includes('isThermal'), 'isThermal handling in PNG/Copy missing in app.js');
});

// 5. Server & Package Whitelist
test('server.js and package.json whitelist thermal-print.js', () => {
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert(serverJs.includes("'thermal-print.js'"), 'thermal-print.js missing in server.js whitelist');

  const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert(pkgJson.build.files.includes('thermal-print.js'), 'thermal-print.js missing in package.json build.files');
});

console.log('\n========================================');
console.log('🎉 All Thermal Slip verifications passed successfully!');
console.log('========================================\n');
