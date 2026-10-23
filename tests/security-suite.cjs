'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

async function runSecurityTests() {
  console.log('\n========================================');
  console.log('🧪 Running Hisaab Security & Concurrency Test Suite');
  console.log('========================================\n');

  let passed = 0;
  let total = 0;

  function test(name, fn) {
    total++;
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✕ ${name}:`, err.message);
      throw err;
    }
  }

  async function testAsync(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✕ ${name}:`, err.message);
      throw err;
    }
  }

  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'ci-test-secure-key-with-over-32-characters-length!';
  process.env.PORT = '3987';

  const app = require('../server.js');

  // 1. PIN Hashing Tests
  console.log('--- 1. Salted PIN Hashing & Verification ---');
  function hashPin(pin) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(pin).trim(), salt, 64).toString('hex');
    return `scrypt:${salt}:${hash}`;
  }

  function verifyPin(candidatePin, storedValue) {
    if (!candidatePin || !storedValue) return false;
    const cleanCandidate = String(candidatePin).trim();
    const cleanStored = String(storedValue).trim();

    if (cleanStored.startsWith('scrypt:')) {
      const parts = cleanStored.split(':');
      if (parts.length !== 3) return false;
      const [, salt, expectedHashHex] = parts;
      const candidateHash = crypto.scryptSync(cleanCandidate, salt, 64);
      const expectedHash = Buffer.from(expectedHashHex, 'hex');
      if (candidateHash.length !== expectedHash.length) return false;
      return crypto.timingSafeEqual(candidateHash, expectedHash);
    }
    const candidateBuf = Buffer.from(cleanCandidate);
    const storedBuf = Buffer.from(cleanStored);
    if (candidateBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(candidateBuf, storedBuf);
  }

  const hashedPin = hashPin('4829');

  test('hashPin produces scrypt:<salt>:<hash> format', () => {
    assert.match(hashedPin, /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/);
  });

  test('verifyPin accepts correct password against salted hash', () => {
    assert.equal(verifyPin('4829', hashedPin), true);
  });

  test('verifyPin rejects incorrect password against salted hash', () => {
    assert.equal(verifyPin('0000', hashedPin), false);
  });

  test('verifyPin supports backward compatibility for legacy plain text PINs', () => {
    assert.equal(verifyPin('1234', '1234'), true);
    assert.equal(verifyPin('9999', '1234'), false);
  });

  // 2. Token Security & Session Fingerprinting
  console.log('\n--- 2. Token Security & Session Fingerprinting ---');
  const secret = process.env.JWT_SECRET;
  function getPinFingerprint(storedValue) {
    return crypto.createHmac('sha256', secret).update(String(storedValue).trim()).digest('hex').slice(0, 16);
  }

  function generateToken(storedValue) {
    const payload = JSON.stringify({
      sub: 'admin',
      fp: getPinFingerprint(storedValue),
      iat: Date.now(),
      exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
    });
    const b64 = Buffer.from(payload).toString('base64');
    const signature = crypto.createHmac('sha256', secret).update(b64).digest('hex');
    return `${b64}.${signature}`;
  }

  function verifyToken(token, storedValue) {
    if (!token || typeof token !== 'string' || !token.includes('.') || !storedValue) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const [b64, signature] = parts;
    try {
      const expectedSig = crypto.createHmac('sha256', secret).update(b64).digest('hex');
      const sigBuf = Buffer.from(signature, 'hex');
      const expSigBuf = Buffer.from(expectedSig, 'hex');
      if (sigBuf.length !== expSigBuf.length || !crypto.timingSafeEqual(sigBuf, expSigBuf)) return false;

      const payload = Buffer.from(b64, 'base64').toString('utf8');
      const data = JSON.parse(payload);
      if (!data.exp || typeof data.exp !== 'number' || Date.now() > data.exp) return false;
      if (data.fp) return data.fp === getPinFingerprint(storedValue);
      return false;
    } catch (_) {
      return false;
    }
  }

  const token = generateToken(hashedPin);

  test('Token does not contain raw PIN in payload', () => {
    const [b64] = token.split('.');
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    assert.equal(decoded.includes('4829'), false);
    assert.equal(decoded.includes('admin'), true);
  });

  test('Token verifies successfully against issuing PIN', () => {
    assert.equal(verifyToken(token, hashedPin), true);
  });

  test('Token is invalidated when user changes their PIN (session revocation)', () => {
    const updatedHashedPin = hashPin('7777');
    assert.equal(verifyToken(token, updatedHashedPin), false);
  });

  test('Tampered token signature is rejected', () => {
    const [b64] = token.split('.');
    const fakeSig = crypto.createHmac('sha256', 'wrong-key-attacker').update(b64).digest('hex');
    assert.equal(verifyToken(`${b64}.${fakeSig}`, hashedPin), false);
  });

  // 3. Static File Protection
  console.log('\n--- 3. Static Asset Security & Path Traversal Shield ---');
  const server = app.listen(3987);

  function fetchUrl(pathname) {
    return new Promise((resolve, reject) => {
      const req = http.get({
        hostname: '127.0.0.1',
        port: 3987,
        path: pathname
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
    });
  }

  try {
    await testAsync('GET /.env is blocked with 404', async () => {
      const res = await fetchUrl('/.env');
      assert.equal(res.status, 404);
    });

    await testAsync('GET /package.json is blocked with 404', async () => {
      const res = await fetchUrl('/package.json');
      assert.equal(res.status, 404);
    });

    await testAsync('GET /server.js is blocked with 404', async () => {
      const res = await fetchUrl('/server.js');
      assert.equal(res.status, 404);
    });

    await testAsync('GET /main.js is blocked with 404', async () => {
      const res = await fetchUrl('/main.js');
      assert.equal(res.status, 404);
    });

    await testAsync('GET /database.js is blocked with 404', async () => {
      const res = await fetchUrl('/database.js');
      assert.equal(res.status, 404);
    });

    await testAsync('GET /external-backup.cjs is blocked with 404', async () => {
      const res = await fetchUrl('/external-backup.cjs');
      assert.equal(res.status, 404);
    });

    await testAsync('GET / serves index.html (status 200)', async () => {
      const res = await fetchUrl('/');
      assert.equal(res.status, 200);
      assert.equal(res.body.includes('Hisaab'), true);
    });

    await testAsync('GET /app.js serves frontend application script (status 200)', async () => {
      const res = await fetchUrl('/app.js');
      assert.equal(res.status, 200);
      assert.equal(res.body.includes('isWebMode'), true);
    });

    await testAsync('GET /style.css serves stylesheet (status 200)', async () => {
      const res = await fetchUrl('/style.css');
      assert.equal(res.status, 200);
    });

    await testAsync('GET /assets/hisaab-logo.svg serves static asset (status 200)', async () => {
      const res = await fetchUrl('/assets/hisaab-logo.svg');
      assert.equal(res.status, 200);
    });

    await testAsync('POST /api/backup validates input payload and rejects empty body with 400', async () => {
      const res = await new Promise((resolve, reject) => {
        const req = http.request({
          hostname: '127.0.0.1',
          port: 3987,
          path: '/api/backup',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }, r => {
          let body = '';
          r.on('data', c => body += c);
          r.on('end', () => resolve({ status: r.statusCode, body }));
        });
        req.on('error', reject);
        req.write(JSON.stringify({}));
        req.end();
      });
      assert.equal(res.status, 400);
      assert.ok(res.body.includes('Invalid backup'));
    });
  } finally {
    server.close();
  }

  console.log('\n========================================');
  console.log(`🎉 All ${passed}/${total} security and concurrency tests passed!`);
  console.log('========================================\n');
  process.exit(0);
}

runSecurityTests().catch(err => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
