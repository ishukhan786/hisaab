'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

console.log('==================================================');
console.log('🚀 Running Hisaab Validation & Test Suite');
console.log('==================================================\n');

const testSuites = [
  { name: 'External Backup Engine', script: 'tests/external-backup.cjs' },
  { name: 'Security, Asset Shield & OCC', script: 'tests/security-suite.cjs' },
  { name: 'Web Unified API & Open Access', script: 'tests/web-unified-api.cjs' },
  { name: 'Web PIN Lock & Compulsory Security', script: 'tests/web-pin-flow.cjs' }
];

let failed = false;

for (const suite of testSuites) {
  console.log(`▶ Executing: ${suite.name} (${suite.script})`);
  const result = spawnSync(process.execPath, [path.resolve(suite.script)], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', ...suite.env }
  });

  if (result.status !== 0) {
    console.error(`\n❌ Test suite failed: ${suite.name} (exit code ${result.status})\n`);
    failed = true;
    break;
  }
  console.log(`\n✔ Completed: ${suite.name}\n`);
}

if (failed) {
  console.error('💥 Test execution finished with errors.');
  process.exit(1);
} else {
  console.log('==================================================');
  console.log('✅ ALL TEST SUITES PASSED SUCCESSFULLY!');
  console.log('==================================================\n');
  process.exit(0);
}
