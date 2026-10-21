'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.PORT = '3988';

const app = require('../server.js');

async function run() {
  console.log('\n========================================');
  console.log('🧪 Running Hisaab Web Unified API Test Suite');
  console.log('========================================\n');

  const server = app.listen(3988);

  function request(method, pathname, body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1',
        port: 3988,
        path: pathname,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers
        }
      }, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data), raw: data });
          } catch (_) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  try {
    // 1. Health endpoint
    const health = await request('GET', '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.data.status, 'ok');
    console.log('  ✓ GET /api/health returns status ok');

    // 2. Index.html does not require login or contain branch switcher
    const index = await request('GET', '/');
    assert.equal(index.status, 200);
    assert.equal(index.raw.includes('office-switcher'), false);
    assert.equal(index.raw.includes('office-select'), false);
    assert.equal(index.raw.includes('clerk-web.js'), false);
    assert.equal(index.raw.includes('branch-admin-ui.js'), false);
    assert.equal(index.raw.includes('clerk-login-panel'), false);
    console.log('  ✓ GET / serves index.html without login barrier or branch elements');

    // 3. Removed obsolete endpoints return 404
    const loginRes = await request('POST', '/api/auth/login', { password: 'test' });
    assert.equal(loginRes.status, 404);
    console.log('  ✓ POST /api/auth/login is completely removed (404)');

    const branchRes = await request('GET', '/api/branches');
    assert.equal(branchRes.status, 404);
    console.log('  ✓ GET /api/branches is completely removed (404)');

    const adminRes = await request('GET', '/api/admin/access');
    assert.equal(adminRes.status, 404);
    console.log('  ✓ GET /api/admin/access is completely removed (404)');

    console.log('\n========================================');
    console.log('🎉 All unified web tests passed successfully!');
    console.log('========================================\n');
    server.close();
    process.exit(0);
  } finally {
    server.close();
  }
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
