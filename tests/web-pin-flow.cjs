'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

console.log('========================================');
console.log('🧪 Running Hisaab Authentication & Access Shield Verification');
console.log('========================================\n');

const htmlContent = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appJsContent = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const authJsContent = fs.readFileSync(path.join(__dirname, '..', 'auth.js'), 'utf8');
const serverJsContent = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

// 1. Verify obsolete PIN lock system has been completely decommissioned
assert.ok(!htmlContent.includes('id="pin-lock-overlay"'), 'Obsolete pin-lock-overlay must be removed from index.html');
assert.ok(!htmlContent.includes('id="pin-dialog"'), 'Obsolete pin-dialog must be removed from index.html');
assert.ok(!htmlContent.includes('id="pin-keypad"'), 'Obsolete pin-keypad must be removed from index.html');
assert.ok(!htmlContent.includes('id="pin-settings-btn"'), 'Obsolete pin-settings-btn must be removed from More menu');
console.log('  ✓ Obsolete PIN lock overlay and keypad completely decommissioned');

// 2. Verify modern Username & Password authentication markup in index.html
assert.ok(htmlContent.includes('id="auth-overlay"'), 'auth-overlay must be in index.html');
assert.ok(htmlContent.includes('id="auth-setup-card"'), 'auth-setup-card must be in index.html');
assert.ok(htmlContent.includes('id="auth-login-card"'), 'auth-login-card must be in index.html');
assert.ok(htmlContent.includes('id="auth-recovery-card"'), 'auth-recovery-card must be in index.html');
assert.ok(htmlContent.includes('id="account-settings-dialog"'), 'account-settings-dialog must be in index.html');
assert.ok(htmlContent.includes('auth.js'), 'auth.js script must be included');
console.log('  ✓ index.html has complete modern English auth layout & account settings markup');

// 3. Verify auth.js engine features
assert.ok(authJsContent.includes('PBKDF2'), 'auth.js must implement cryptographic PBKDF2 hashing');
assert.ok(authJsContent.includes('executeSetup'), 'auth.js must implement setup wizard');
assert.ok(authJsContent.includes('executeLogin'), 'auth.js must implement compulsory login barrier');
assert.ok(authJsContent.includes('executeRecovery'), 'auth.js must implement recovery PIN password reset');
assert.ok(authJsContent.includes('INACTIVITY_TIMEOUT_MS'), 'auth.js must implement 15-minute inactivity lock');
console.log('  ✓ auth.js implements PBKDF2 hashing, recovery PIN, and auto-lock');

// 4. Verify app.js shortcut & lock integration
assert.ok(appJsContent.includes('window.HisaabAuth.lock'), 'app.js must route Ctrl+L and manual locks to HisaabAuth');
assert.ok(serverJsContent.includes('/api/state') && serverJsContent.includes('/api/save'), 'Server persistence routes available');
console.log('  ✓ app.js and server persistence fully synchronized with authentication system');

// 5. Verify default admin/admin credentials for fresh installs on other PCs/laptops
const crypto = require('node:crypto');
assert.ok(authJsContent.includes('DEFAULT_AUTH'), 'auth.js must provide default credentials');
assert.ok(authJsContent.includes("username: 'admin'"), 'auth.js default username must be admin');
const expectedAdminHash = crypto.pbkdf2Sync('admin', 'hisaab_default_salt_2026', 20000, 32, 'sha256').toString('hex');
assert.ok(authJsContent.includes(expectedAdminHash), 'auth.js must include verified PBKDF2 hash for password admin');
assert.ok(serverJsContent.includes("process.env.HISAAB_PASSWORD || 'admin'"), 'server.js default password must be admin');
assert.ok(serverJsContent.includes("process.env.HISAAB_USERNAME || 'admin'"), 'server.js default username must be admin');
console.log('  ✓ default credentials (admin / admin) verified for fresh PC/laptop installs');

console.log('\n========================================');
console.log('🎉 All Authentication & Access Shield verifications passed!');
console.log('========================================\n');
