'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');

console.log('==================================================');
console.log('🚀 Running Hisaab Validation & Test Suite');
console.log('==================================================\n');

const testSuites = [
  { name: 'External Backup Engine', script: 'tests/external-backup.cjs' },
  { name: 'Clerk signature and branch authorization', script: 'tests/clerk-auth.cjs' },
  { name: 'Local Clerk startup mappings', script: 'tests/local-clerk-config.cjs' },
  { name: 'Login-only browser configuration', script: 'tests/clerk-web.cjs' },
  { name: 'Branch assignments and concurrent admin changes', script: 'tests/branch-access.cjs' },
  { name: 'Clerk API middleware and legacy auth cutover', script: 'tests/clerk-api.cjs' },
  { name: 'Security, Auth, OCC & Asset Shield', script: 'tests/security-suite.cjs', env: {HISAAB_AUTH_PROVIDER:'pin'} },
  { name: 'Branch API isolation and staff permissions', script: 'tests/branches-web.cjs', env: {HISAAB_BRANCH_API_ONLY:'1',HISAAB_AUTH_PROVIDER:'pin'} }
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
