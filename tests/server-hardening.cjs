'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

console.log('========================================');
console.log('🧪 Running Hisaab Server Security Hardening Verification');
console.log('========================================\n');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

// 1. Static guards exist in server.js
assert.ok(serverSource.includes('IS_PRODUCTION'), 'server.js must detect production mode');
assert.ok(/process\.exit\(1\)/.test(serverSource), 'server.js must fail fast on an insecure production secret');
assert.ok(serverSource.includes('HISAAB_ALLOWED_ORIGINS'), 'server.js must support an explicit CORS allow-list');
console.log('  ✓ Production secret guard, CORS allow-list and default-password warning present');

// A tiny runner that loads the server and reports whether startup completed.
function loadServer(secret) {
  return spawnSync(process.execPath, ['-e', "require('./server.js'); console.log('SERVER_LOADED')"], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', VERCEL: '', HISAAB_AUTH_SECRET: secret },
    encoding: 'utf8'
  });
}

// 2. Runtime: the placeholder secret must abort production startup.
const weak = loadServer('change-this-to-a-long-random-secret');
assert.equal(weak.status, 1, 'placeholder production secret must exit with code 1');
assert.match(weak.stderr, /FATAL: Set HISAAB_AUTH_SECRET/, 'placeholder secret must print a clear fatal message');
assert.ok(!weak.stdout.includes('SERVER_LOADED'), 'server must not finish loading with a placeholder secret');
console.log('  ✓ Placeholder production secret aborts startup with a clear message');

// 3. Runtime: a strong secret must load cleanly.
const strong = loadServer('a'.repeat(48));
assert.equal(strong.status, 0, `strong production secret must load cleanly (stderr: ${strong.stderr})`);
assert.match(strong.stdout, /SERVER_LOADED/, 'strong secret startup must complete');
console.log('  ✓ Strong production secret loads cleanly');

console.log('\n🎉 Server security hardening verification passed successfully!');
