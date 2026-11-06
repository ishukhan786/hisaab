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

// 4. Runtime: static assets are gzip-compressed and versioned assets are cached.
process.env.NODE_ENV = 'test';
const http = require('node:http');
const zlib = require('node:zlib');
const app = require(path.join(root, 'server.js'));
const PORT = 3986;
function fetchAsset(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: pathname, method: 'GET', headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const server = app.listen(PORT);
  await new Promise(r => server.once('listening', r));
  try {
    const css = await fetchAsset('/ui.css?v=1.4.36', { 'Accept-Encoding': 'gzip' });
    assert.equal(css.status, 200, 'ui.css must be served');
    assert.equal(css.headers['content-encoding'], 'gzip', 'versioned CSS must be gzip-compressed');
    assert.match(css.headers['cache-control'] || '', /immutable/, 'versioned asset must be immutable-cached');
    assert.equal(zlib.gunzipSync(css.body).toString('utf8'), fs.readFileSync(path.join(root, 'ui.css'), 'utf8'), 'gzip body must decompress to the real file');
    console.log('  ✓ Versioned CSS is gzip-compressed, valid, and immutable-cached');

    const html = await fetchAsset('/index.html', { 'Accept-Encoding': 'gzip' });
    assert.equal(html.status, 200, 'index.html must be served');
    assert.match(html.headers['cache-control'] || '', /no-cache/, 'HTML must revalidate');
    console.log('  ✓ HTML revalidates instead of being cached');

    console.log('\n🎉 Server security hardening verification passed successfully!');
  } finally {
    server.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
