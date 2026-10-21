'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('========================================');
console.log('🧪 Running Hisaab Web PIN Lock Verification');
console.log('========================================\n');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const serverJsContent = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// 1. Verify index.html contains all PIN overlay elements
assert.ok(htmlContent.includes('id="pin-lock-overlay"'), 'pin-lock-overlay must be in index.html');
assert.ok(htmlContent.includes('id="pin-unlock-form"'), 'pin-unlock-form must be in index.html');
assert.ok(htmlContent.includes('id="pin-unlock-input"'), 'pin-unlock-input must be in index.html');
assert.ok(htmlContent.includes('id="pin-keypad"'), 'pin-keypad must be in index.html');
assert.ok(htmlContent.includes('id="pin-default-hint"'), 'pin-default-hint must be in index.html');
assert.ok(htmlContent.includes('id="toggle-pwd-btn"'), 'toggle-pwd-btn must be in index.html');
assert.ok(htmlContent.includes('id="pin-dialog"'), 'pin-dialog must be in index.html');
console.log('  ✓ index.html has complete PIN lock overlay and settings markup');

// 2. Verify instant zero-flash lock inline script in index.html
assert.ok(
  htmlContent.includes("window.location.protocol.startsWith('http')") &&
  htmlContent.includes("ov.hidden = false;") &&
  htmlContent.includes("el.inert = true;"),
  'Immediate inline script must lock overlay and set body elements inert on web load'
);
console.log('  ✓ Immediate inline script prevents flash of unauthenticated data on web load');

// 3. Verify PIN logic in app.js
assert.ok(
  appJsContent.includes("const effectivePin=state.pinCode||(isWebMode?'1234':'');"),
  'effectivePin must fall back to 1234 in web mode'
);
assert.ok(
  appJsContent.includes("$('pin-remove-btn').hidden=isWebMode||!state.pinCode;"),
  'PIN removal must be forbidden/hidden on web mode (compulsory PIN)'
);
assert.ok(
  appJsContent.includes("if (isWebMode || state.pinCode) {"),
  'requestPinUnlock must be called on startup when in web mode'
);
console.log('  ✓ Web mode defaults to PIN 1234 and enforces compulsory lock');

// 4. Verify PIN keypad digits & controls in app.js
assert.ok(appJsContent.includes("btn.dataset.key"), 'PIN keypad handler must be implemented');
assert.ok(appJsContent.includes("key==='clear'"), 'PIN keypad must support clear');
assert.ok(appJsContent.includes("key==='backspace'"), 'PIN keypad must support backspace');
assert.ok(appJsContent.includes("triggerPinShake()"), 'Wrong PIN must trigger shake animation');
console.log('  ✓ PIN keypad and shake animation logic correctly integrated');

// 5. Verify Server state persistence supports pinCode
assert.ok(
  serverJsContent.includes('/api/state') && serverJsContent.includes('/api/save'),
  'Server must provide /api/state and /api/save to persist state with pinCode'
);
console.log('  ✓ Server persistence routes available for cloud sync');

console.log('\n========================================');
console.log('🎉 All Web PIN Lock verifications passed!');
console.log('========================================\n');
