'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { HisaabDatabase, validateState, HisaabError } = require('../database');

const testDir = path.resolve('scratch', 'db-regression-' + Date.now());
fs.mkdirSync(testDir, { recursive: true });

function makeBaseState() {
  return {
    version: 4,
    title: 'Regression Test',
    date: '2026-10-22',
    fontSize: 13,
    startSerial: 1,
    partySerials: { BranchA: 1 },
    branches: ['BranchA'],
    partyCurrencies: { BranchA: 'pkr' },
    rows: [{
      id: 'r1',
      entryDate: '2026-10-22',
      sender: 'Alice',
      mobile: '03001234567',
      receiver: 'Bob',
      place: 'Lahore',
      branch: 'BranchA',
      balance: '100',
      aed: '0',
      pkr: '500',
      orderType: '',
      balanceType: 'current',
      history: []
    }],
    trash: [],
    lockedDates: [],
    pinCode: '1234',
    lastBackupAt: null,
    journal: {
      date: '2026-10-22',
      cashCounts: { '2026-10-22': '500' },
      rows: [{ id: 'j1', date: '2026-10-22', detail: 'Cash in', debit: '500', credit: '' }]
    }
  };
}

console.log('🧪 Starting 16-Scenario Regression Suite for HisaabDatabase');

// 1. Fresh DB init → save → reload
{
  const file = path.join(testDir, 'test-1.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  const initRes = db.commit(state, 0, { initialize: true });
  assert.equal(initRes.revision, 1);
  const loaded = db.load();
  assert.deepEqual(loaded.state, state);
  assert.equal(loaded.revision, 1);
  db.close();
  console.log('  ✓ 1. Fresh DB init → save → reload');
}

// 2. Stale revision save → STALE_STATE error code
{
  const file = path.join(testDir, 'test-2.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  db.commit(state, 0, { initialize: true });
  assert.throws(() => db.commit(state, 0), err => {
    return err instanceof HisaabError && err.code === 'STALE_STATE' && err.message.startsWith('STALE_STATE:');
  });
  db.close();
  console.log('  ✓ 2. Stale revision save → STALE_STATE error code');
}

// 3. Draft row (branch empty) → saved (not filtered)
{
  const file = path.join(testDir, 'test-3.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  state.rows.push({
    id: 'draft-empty-branch',
    entryDate: '2026-10-22',
    sender: 'Draft Sender',
    mobile: '',
    receiver: '',
    place: '',
    branch: '',
    balance: '',
    aed: '',
    pkr: '10',
    history: []
  });
  db.commit(state, 0, { initialize: true });
  const loaded = db.load();
  const found = loaded.state.rows.find(r => r.id === 'draft-empty-branch');
  assert.ok(found, 'Draft row with empty branch was retained');
  assert.equal(found.sender, 'Draft Sender');
  db.close();
  console.log('  ✓ 3. Draft row (branch empty) → saved (not filtered)');
}

// 4. Draft row (branch null) → saved
{
  const file = path.join(testDir, 'test-4.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  state.rows.push({
    id: 'draft-null-branch',
    entryDate: '2026-10-22',
    sender: 'Draft Sender 2',
    mobile: '',
    receiver: '',
    place: '',
    branch: null,
    balance: '',
    aed: '50',
    pkr: '',
    history: []
  });
  db.commit(state, 0, { initialize: true });
  const loaded = db.load();
  const found = loaded.state.rows.find(r => r.id === 'draft-null-branch');
  assert.ok(found, 'Draft row with null branch was retained');
  db.close();
  console.log('  ✓ 4. Draft row (branch null) → saved');
}

// 5. orderType=null → saved
{
  const file = path.join(testDir, 'test-5.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  state.rows[0].orderType = null;
  db.commit(state, 0, { initialize: true });
  const loaded = db.load();
  assert.equal(loaded.state.rows[0].orderType, null);
  db.close();
  console.log('  ✓ 5. orderType=null → saved');
}

// 6. orderType='bank' → saved
{
  const file = path.join(testDir, 'test-6.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  state.rows[0].orderType = 'bank';
  db.commit(state, 0, { initialize: true });
  const loaded = db.load();
  assert.equal(loaded.state.rows[0].orderType, 'bank');
  db.close();
  console.log('  ✓ 6. orderType="bank" → saved');
}

// 7. Re-delete same row (trash collision) → no PK error
{
  const file = path.join(testDir, 'test-7.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  state.trash = [
    { row: { ...state.rows[0], id: 'same-row' }, index: 0 },
    { row: { ...state.rows[0], id: 'same-row' }, index: 1 }
  ];
  db.commit(state, 0, { initialize: true });
  const loaded = db.load();
  assert.equal(loaded.state.trash.length, 2);
  assert.equal(loaded.state.trash[0].row.id, 'same-row');
  assert.equal(loaded.state.trash[1].row.id, 'same-row');
  db.close();
  console.log('  ✓ 7. Re-delete same row (trash collision) → no PK error');
}

// 8. Restore with initialize=true → BOTH backup paths returned
{
  const file = path.join(testDir, 'test-8.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  const legacy = JSON.stringify({ ...state, version: 3 });
  const res = db.commit(state, 0, { initialize: true, legacyRaw: legacy, restore: true, current: state });
  assert.ok(res.backupPath, 'backupPath present');
  assert.equal(res.backupPaths.length, 2, 'BOTH backup paths returned');
  assert.ok(fs.existsSync(res.backupPaths[0]));
  assert.ok(fs.existsSync(res.backupPaths[1]));
  db.close();
  console.log('  ✓ 8. Restore with initialize=true → BOTH backup paths returned');
}

// 9. Restore with initialize=false → safety backup written
{
  const file = path.join(testDir, 'test-9.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  db.commit(state, 0, { initialize: true });
  const restoredState = makeBaseState();
  restoredState.title = 'Restored State';
  const res = db.commit(restoredState, 1, { restore: true, current: state });
  assert.ok(res.backupPath);
  assert.ok(fs.existsSync(res.backupPath));
  assert.equal(fs.readFileSync(res.backupPath, 'utf8').includes('Regression Test'), true);
  db.close();
  console.log('  ✓ 9. Restore with initialize=false → safety backup written');
}

// 10. Backup write fails (read-only backupDir) → transaction rollback, no state change
{
  const file = path.join(testDir, 'test-10.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  db.commit(state, 0, { initialize: true });
  
  // Make backupDir unwritable
  const backupDir = db.backupDir;
  const held = backupDir + '-held';
  if (fs.existsSync(backupDir)) fs.renameSync(backupDir, held);
  fs.writeFileSync(backupDir, 'unwritable file blocking dir');
  
  const newState = makeBaseState();
  newState.title = 'Should Not Persist';
  assert.throws(() => db.commit(newState, 1, { restore: true, current: state }));
  
  // Clean up blockage
  fs.unlinkSync(backupDir);
  if (fs.existsSync(held)) fs.renameSync(held, backupDir);
  
  // Verify state untouched
  const loaded = db.load();
  assert.equal(loaded.state.title, 'Regression Test');
  assert.equal(loaded.revision, 1);
  db.close();
  console.log('  ✓ 10. Backup write fails → transaction rollback, no state change');
}

// 11. Oversized history (>50KB) → rejected with clear error
{
  const state = makeBaseState();
  state.rows[0].history = Array.from({ length: 30 }, () => ({
    at: '2026-10-22T00:00:00.000Z',
    field: 'aed',
    from: 'x'.repeat(900),
    to: 'y'.repeat(900)
  }));
  assert.throws(() => validateState(state), err => {
    return err instanceof HisaabError && err.code === 'INVALID_DATA' && err.message.includes('history size');
  });
  console.log('  ✓ 11. Oversized history (>50KB) → rejected with clear error');
}

// 12. Orphan partyCurrencies key → rejected
{
  const state = makeBaseState();
  state.partyCurrencies['NonExistentParty'] = 'pkr';
  assert.throws(() => validateState(state), err => {
    return err instanceof HisaabError && err.code === 'INVALID_DATA' && err.message.includes('orphan currency');
  });
  console.log('  ✓ 12. Orphan partyCurrencies key → rejected');
}

// 13. Revision at MAX_SAFE_INTEGER - 1 → save works
{
  const file = path.join(testDir, 'test-13.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  // set revision directly in app_state
  const targetRev = Number.MAX_SAFE_INTEGER - 1;
  db.db.prepare('UPDATE app_state SET revision=? WHERE id=1').run(targetRev);
  const res = db.commit(state, targetRev, { initialize: true });
  assert.equal(res.revision, Number.MAX_SAFE_INTEGER);
  db.close();
  console.log('  ✓ 13. Revision at MAX_SAFE_INTEGER - 1 → save works');
}

// 14. Revision at MAX_SAFE_INTEGER → overflow error
{
  const file = path.join(testDir, 'test-14.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  assert.throws(() => db.commit(state, Number.MAX_SAFE_INTEGER, { initialize: true }), err => {
    return err instanceof HisaabError && err.code === 'REVISION_OVERFLOW';
  });
  db.close();
  console.log('  ✓ 14. Revision at MAX_SAFE_INTEGER → overflow error');
}

// 15. Double close() → no throw
{
  const file = path.join(testDir, 'test-15.sqlite');
  const db = new HisaabDatabase(file);
  db.close();
  assert.doesNotThrow(() => db.close());
  console.log('  ✓ 15. Double close() → no throw');
}

// 16. load() on empty DB → {state:null, revision:0}
{
  const file = path.join(testDir, 'test-16.sqlite');
  const db = new HisaabDatabase(file);
  const head = db.load();
  assert.equal(head.state, null);
  assert.equal(head.revision, 0);
  db.close();
  console.log('  ✓ 16. load() on empty DB → {state:null, revision:0}');
}

// 17. Incremental khata_accounts and khata_entries SQLite table storage & round-trip
{
  const file = path.join(testDir, 'test-17.sqlite');
  const db = new HisaabDatabase(file);
  const state = makeBaseState();
  state.khatas = [
    {
      id: 'kh-1',
      code: '1',
      name: 'حاجی اکبر',
      mobile: '03001112233',
      address: 'لاہور',
      currency: 'pkr',
      rows: [
        { id: 'r1', date: '2026-09-10', detail: 'سابقہ بقایا', debit: '50,000', credit: '' },
        { id: 'r2', date: '2026-10-05', detail: 'کیش وصولی', debit: '', credit: '15,000' }
      ]
    },
    {
      id: 'kh-2',
      code: '2',
      name: 'النور ٹریڈرز',
      mobile: '0509988776',
      address: 'دبئی',
      currency: 'aed',
      rows: [
        { id: 'r1', date: '2026-10-12', detail: 'حوالہ', debit: '2,500', credit: '' }
      ]
    }
  ];
  const r1 = db.commit(state, 0, { initialize: true });
  assert.equal(r1.revision, 1);

  // Verify app_state.metadata does not bloat with full khatas array
  const rawMeta = JSON.parse(db.db.prepare('SELECT metadata FROM app_state WHERE id=1').get().metadata);
  assert.deepEqual(rawMeta.khatas, [], 'app_state.metadata stores compact [] marker while rows live in khata_accounts/khata_entries');
  assert.equal(db.db.prepare('SELECT COUNT(*) AS c FROM khata_accounts').get().c, 2);
  assert.equal(db.db.prepare('SELECT COUNT(*) AS c FROM khata_entries').get().c, 3);

  const loaded = db.load();
  assert.deepEqual(loaded.state, state);

  // Incremental update: remove 1 entry and add 1 entry
  state.khatas[0].rows.splice(1, 1);
  state.khatas[1].rows.push({ id: 'r2', date: '2026-10-15', detail: 'وصولی', debit: '', credit: '1,000' });
  const r2 = db.commit(state, 1);
  assert.equal(r2.revision, 2);
  assert.deepEqual(db.load().state, state);
  db.close();
  console.log('  ✓ 17. Incremental khata_accounts & khata_entries SQLite tables round-trip & diff update');
}

console.log('\n🎉 ALL 17 REGRESSION SCENARIOS VERIFIED SUCCESSFULLY!');
