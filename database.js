'use strict';
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/* Add-on C: Machine-readable error taxonomy */
class HisaabError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'HisaabError';
    this.code = code;
  }
}

const MAX_BYTES = 15_000_000;
const fields = ['sender','mobile','receiver','place','branch','balance','aed','pkr'];
const validDateCache = new Set();
const validDate = value => {
  if (typeof value !== 'string') return false;
  if (validDateCache.has(value)) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = Date.parse(value);
  if (isNaN(t) || new Date(t).toISOString().slice(0, 10) !== value) return false;
  if (validDateCache.size > 4096) validDateCache.clear();
  validDateCache.add(value);
  return true;
};
const text = (value, max) => typeof value === 'string' && value.length <= max;
const validKhataAmount = value => {
  if (!text(value, 40)) return false;
  const normalized = value.replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632))
    .replace(/[٬,\s]/g, '');
  return normalized === '' || /^\+?\d{1,12}(?:\.\d{0,2})?$/.test(normalized);
};
/* FIX-11: use HisaabError with INVALID_DATA code */
function invalid(message) { throw new HisaabError('Invalid data: ' + message, 'INVALID_DATA'); }

function validateState(input) {
  const json = JSON.stringify(input);
  if (!json || Buffer.byteLength(json) > MAX_BYTES) invalid('size');
  const data = JSON.parse(json);
  if (!data || data.version !== 4 || !text(data.title,100) || !(data.date === '' || validDate(data.date))) invalid('header');
  if (!Array.isArray(data.rows) || data.rows.length > 10000 || !Array.isArray(data.branches) || data.branches.length > 10000) invalid('register');
  const parties = new Set();
  for (const name of data.branches) {
    if (!text(name,300) || !name.trim() || parties.has(name)) invalid('party');
    parties.add(name);
  }
  /* FIX-9: validate partyCurrencies reject orphan keys not present in branches */
  if (data.partyCurrencies != null) {
    if (typeof data.partyCurrencies !== 'object' || Array.isArray(data.partyCurrencies)) invalid('currency');
    for (const [name, currency] of Object.entries(data.partyCurrencies)) {
      if (!parties.has(name)) invalid('orphan currency');
      if (!['pkr','afn'].includes(currency)) invalid('currency');
    }
  }
  if (data.partyDateFilters != null) {
    if (typeof data.partyDateFilters !== 'object' || Array.isArray(data.partyDateFilters)) invalid('partyDateFilters');
    for (const [key, filter] of Object.entries(data.partyDateFilters)) {
      if (!text(key, 350)) invalid('partyDateFilters key');
      if (filter != null) {
        if (typeof filter !== 'object' || Array.isArray(filter)) invalid('partyDateFilters item');
        if (filter.mode != null && !['day', 'range', 'all'].includes(filter.mode)) invalid('partyDateFilters mode');
        if (filter.date && !validDate(filter.date)) invalid('partyDateFilters date');
        if (filter.from && !validDate(filter.from)) invalid('partyDateFilters from');
        if (filter.to && !validDate(filter.to)) invalid('partyDateFilters to');
      }
    }
  }
  const ids = new Set();
  const registerRow = (row, isTrash = false) => {
    if (!row || !text(row.id,99) || (!isTrash && ids.has(row.id)) || !validDate(row.entryDate)) invalid('entry');
    /* FIX-15: enforce strict per-field max lengths */
    if (!text(row.sender,300) || !text(row.receiver,300) || !text(row.place,300)) invalid('entry text');
    if (!text(row.mobile,40) || !text(row.balance,40) || !text(row.aed,40) || !text(row.pkr,40)) invalid('entry amounts');
    /* FIX-1: branch can be null/undefined or string in draft rows */
    if (row.branch != null && !text(row.branch,300)) invalid('branch');
    if (row.branch && !parties.has(row.branch)) invalid('missing party');
    /* FIX-2: orderType and balanceType allow null or undefined */
    if (row.orderType != null && !['','bank','city'].includes(row.orderType)) invalid('order type');
    if (row.balanceType != null && !text(row.balanceType,300)) invalid('balance type');
    if (!isTrash) ids.add(row.id);
    /* FIX-7 & FIX-16: history field limits and total 50KB per-row serialized cap */
    if (row.history !== undefined) {
      if (!Array.isArray(row.history) || row.history.length > 30) invalid('history');
      if (row.history.length > 0) {
        if (row.history.some(h => !h || !text(h.at,40) || !text(h.field,40) || !text(h.from,2000) || !text(h.to,2000))) invalid('history');
        if (Buffer.byteLength(JSON.stringify(row.history)) > 50_000) invalid('history size');
      }
    }
  };
  data.rows.forEach(r => registerRow(r, false));
  if (!Array.isArray(data.trash) || data.trash.length > 20) invalid('trash');
  for (const item of data.trash) {
    if (!item || !Number.isInteger(item.index) || item.index < 0) invalid('trash index');
    registerRow(item.row, true);
  }
  if (!data.journal || !validDate(data.journal.date) || !Array.isArray(data.journal.rows) || data.journal.rows.length > 10001) invalid('journal');
  if (data.journal.cashCounts !== undefined) {
    const counts = data.journal.cashCounts;
    if (!counts || typeof counts !== 'object' || Array.isArray(counts) || Object.keys(counts).length > 10000) invalid('cash counts');
    for (const [date,value] of Object.entries(counts)) if (!validDate(date) || !text(value,40)) invalid('cash count');
  }
  const journalIds = new Set();
  for (const row of data.journal.rows) {
    if (!row || !text(row.id,99) || journalIds.has(row.id) || !validDate(row.date) || !text(row.detail,2000) || !text(row.debit,40) || !text(row.credit,40)) invalid('journal entry');
    journalIds.add(row.id);
  }
  /* FIX-1: safely filter empty draft rows; keep rows with content even if branch is empty */
  data.rows = data.rows.filter(r => fields.filter(f => f !== 'branch').some(f => typeof r[f] === 'string' && r[f].trim()));
  data.journal.rows = data.journal.rows.filter(r => ['detail','debit','credit'].some(f => typeof r[f] === 'string' && r[f].trim()));
  if (data.khatas !== undefined) {
    if (!Array.isArray(data.khatas) || data.khatas.length > 5000) invalid('khatas');
    const khataIds = new Set(), khataCodes = new Set();
    for (const khata of data.khatas) {
      const code = typeof khata?.code === 'string' ? khata.code.trim().toUpperCase() : '';
      if (!khata || !text(khata.id, 99) || !khata.id.trim() || !code || !text(khata.name, 300) || !khata.name.trim()) invalid('khata profile');
      if (khataIds.has(khata.id) || khataCodes.has(code)) invalid('duplicate khata');
      khataIds.add(khata.id); khataCodes.add(code);
      if (khata.mobile !== undefined && !text(khata.mobile, 40)) invalid('khata mobile');
      if (khata.address !== undefined && !text(khata.address, 300)) invalid('khata address');
      if (khata.currency !== undefined && !['pkr', 'aed'].includes(khata.currency)) invalid('khata currency');
      if (khata.rows !== undefined) {
        if (!Array.isArray(khata.rows) || khata.rows.length > 10000) invalid('khata rows');
        const rowIds = new Set();
        for (const r of khata.rows) {
          if (!r || !text(r.id, 99) || rowIds.has(r.id) || !validDate(r.date) || !text(r.detail, 2000) || !validKhataAmount(r.debit) || !validKhataAmount(r.credit)) invalid('khata entry');
          if (r.debit.trim() && r.credit.trim()) invalid('khata double-sided entry');
          rowIds.add(r.id);
        }
        khata.rows = khata.rows.filter(r => ['detail', 'debit', 'credit'].some(f => typeof r[f] === 'string' && r[f].trim()));
      }
    }
  }
  return data;
}

class HisaabDatabase {
  constructor(filename, {backupDir} = {}) {
    fs.mkdirSync(path.dirname(filename),{recursive:true});
    this.filename = filename;
    this.backupDir = backupDir || path.join(path.dirname(filename),'backups');
    this.db = new Database(filename,{timeout:2000});
    try {
      const version = this.db.pragma('user_version',{simple:true});
      /* FIX-11: machine-readable error codes */
      if (version !== 0 && version !== 1) throw new HisaabError('Unsupported database version', 'UNSUPPORTED_VERSION');
      if (this.db.pragma('quick_check',{simple:true}) !== 'ok') throw new HisaabError('Database integrity check failed', 'INTEGRITY_CHECK_FAILED');
      if (version === 0 && this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length) throw new HisaabError('Unknown database schema', 'UNKNOWN_SCHEMA');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('temp_store = MEMORY');
      this.db.pragma('cache_size = -64000');
      if (version === 0) this.db.transaction(() => {
        this.db.exec(`
          CREATE TABLE app_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, metadata TEXT CHECK(json_valid(metadata)));
          INSERT INTO app_state VALUES(1,0,NULL);
          CREATE TABLE parties (name TEXT PRIMARY KEY, currency TEXT NOT NULL CHECK(currency IN ('pkr','afn')), position INTEGER NOT NULL);
          CREATE TABLE register_entries (id TEXT PRIMARY KEY, position INTEGER NOT NULL, entry_date TEXT NOT NULL, party TEXT REFERENCES parties(name) DEFERRABLE INITIALLY DEFERRED, data TEXT NOT NULL CHECK(json_valid(data)));
          CREATE INDEX register_date_party ON register_entries(entry_date,party);
          CREATE TABLE journal_entries (id TEXT PRIMARY KEY, position INTEGER NOT NULL, entry_date TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
          CREATE INDEX journal_date ON journal_entries(entry_date);
          CREATE TABLE trash_entries (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
          CREATE TABLE khata_accounts (id TEXT PRIMARY KEY, position INTEGER NOT NULL, code TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
          CREATE TABLE khata_entries (id TEXT PRIMARY KEY, khata_id TEXT NOT NULL, position INTEGER NOT NULL, entry_date TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
          CREATE INDEX khata_entries_account ON khata_entries(khata_id, position);
          CREATE TABLE migration_sources (id INTEGER PRIMARY KEY CHECK(id=1), imported_at TEXT NOT NULL, legacy_json TEXT, backup_path TEXT);
          PRAGMA user_version = 1;
        `);
      })();
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS khata_accounts (id TEXT PRIMARY KEY, position INTEGER NOT NULL, code TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
        CREATE TABLE IF NOT EXISTS khata_entries (id TEXT PRIMARY KEY, khata_id TEXT NOT NULL, position INTEGER NOT NULL, entry_date TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
        CREATE INDEX IF NOT EXISTS khata_entries_account ON khata_entries(khata_id, position);
      `);
      if (this.db.pragma('foreign_key_check').length) throw new HisaabError('Database references are damaged', 'FOREIGN_KEY_VIOLATION');
      this.statements = {};
      this.caches = {};
      /* FIX-8: derive columns dynamically from table_info pragma to avoid schema drift */
      for (const table of ['parties','register_entries','journal_entries','trash_entries','khata_accounts','khata_entries']) {
        const key = table === 'parties' ? 'name' : 'id';
        const columns = this.db.pragma(`table_info(${table})`).map(r => r.name);
        this.statements[table] = {
          put:this.db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(c=>'@'+c).join(',')}) ON CONFLICT(${key}) DO UPDATE SET ${columns.filter(c=>c!==key).map(c=>c+'=excluded.'+c).join(',')}`),
          remove:this.db.prepare(`DELETE FROM ${table} WHERE ${key}=?`),
          readData:columns.includes('data') ? this.db.prepare(`SELECT ${table === 'khata_entries' ? 'khata_id, data' : 'data'} FROM ${table} ORDER BY position`) : null,
          key
        };
        this.caches[table] = new Map(this.db.prepare(`SELECT * FROM ${table}`).all().map(r=>[r[key],JSON.stringify(r)]));
      }
      this.headSelectStmt = this.db.prepare('SELECT * FROM app_state WHERE id=1');
      this.headRevSelectStmt = this.db.prepare('SELECT revision,metadata FROM app_state WHERE id=1');
      this.headUpdateStmt = this.db.prepare('UPDATE app_state SET metadata=?,revision=? WHERE id=1');
      this.load();
    } catch (error) { this.close(); throw error; }
  }

  load() {
    const head = this.headSelectStmt.get();
    /* FIX-11: machine-readable error codes */
    if (!head) throw new HisaabError('Missing database metadata', 'MISSING_METADATA');
    if (head.metadata === null) return {state:null,revision:head.revision};
    const metadata = JSON.parse(head.metadata);
    const read = table => this.statements[table].readData.all().map(r=>JSON.parse(r.data));
    const stateObj = {...metadata,rows:read('register_entries'),trash:read('trash_entries'),journal:{...metadata.journal,rows:read('journal_entries')}};
    if (metadata.khatas !== undefined) {
      const accountRows = this.statements.khata_accounts.readData.all();
      if (accountRows.length > 0) {
        const entriesByKhata = new Map();
        for (const r of this.statements.khata_entries.readData.all()) {
          let list = entriesByKhata.get(r.khata_id);
          if (!list) { list = []; entriesByKhata.set(r.khata_id, list); }
          list.push(JSON.parse(r.data));
        }
        stateObj.khatas = accountRows.map(r => {
          const acc = JSON.parse(r.data);
          if (acc.rows !== undefined) acc.rows = entriesByKhata.get(acc.id) || [];
          return acc;
        });
      } else {
        stateObj.khatas = metadata.khatas;
      }
    }
    return {state:validateState(stateObj),revision:head.revision};
  }

  /* FIX-4: crash-safe atomic backup write with robust fd closure */
  writeBackup(prefix,content) {
    fs.mkdirSync(this.backupDir,{recursive:true});
    const target = path.join(this.backupDir,`${prefix}_${new Date().toISOString().replace(/[:.]/g,'-')}_${randomUUID()}.json`);
    let fd;
    try {
      fd = fs.openSync(target,'wx');
      fs.writeFileSync(fd,content,'utf8');
      fs.fsyncSync(fd);
    } catch(error) {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
        fd = undefined;
      }
      try { fs.unlinkSync(target); } catch {}
      throw error;
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch {}
      }
    }
    return target;
  }

  commit(input,expectedRevision,{initialize=false,legacyRaw=null,restore=false,current=null}={}) {
    const data = validateState(input);
    /* FIX-10: check revision valid integer and guard against MAX_SAFE_INTEGER overflow */
    if (typeof expectedRevision !== 'number' || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new HisaabError('Invalid revision', 'INVALID_REVISION');
    }
    if (expectedRevision >= Number.MAX_SAFE_INTEGER) {
      throw new HisaabError('Revision overflow', 'REVISION_OVERFLOW');
    }
    /* FIX-14: single byte-length check without redundant text() call */
    if (legacyRaw !== null && (typeof legacyRaw !== 'string' || Buffer.byteLength(legacyRaw) > MAX_BYTES)) invalid('legacy source');
    /* FIX-6: validate current state only when restore=true and current is not null */
    const currentData = (restore && current !== null) ? validateState(current) : null;
    const khataList = data.khatas || [];
    const khataEntries = [];
    let entryPos = 0;
    for (const k of khataList) {
      if (Array.isArray(k.rows)) {
        for (const r of k.rows) {
          khataEntries.push({id:`${k.id}:${r.id}`,khata_id:k.id,position:entryPos++,entry_date:r.date,data:JSON.stringify(r)});
        }
      }
    }
    const tables = {
      parties:data.branches.map((name,position)=>({name,currency:data.partyCurrencies?.[name]==='afn'?'afn':'pkr',position})),
      register_entries:data.rows.map((row,position)=>({id:row.id,position,entry_date:row.entryDate,party:row.branch||null,data:JSON.stringify(row)})),
      journal_entries:data.journal.rows.map((row,position)=>({id:row.id,position,entry_date:row.date,data:JSON.stringify(row)})),
      /* FIX-3: composite key ${position}_${item.row.id} prevents PK collision on re-delete */
      trash_entries:data.trash.map((item,position)=>({id:`${position}_${item.row.id}`,position,data:JSON.stringify(item)})),
      khata_accounts:khataList.map((k,position)=>({id:k.id,position,code:k.code.trim().toUpperCase(),data:JSON.stringify({...k,rows:k.rows!==undefined?[]:undefined})})),
      khata_entries:khataEntries
    };
    /* FIX-13: delete empty partyCurrencies to eliminate cosmetic bloat in app_state.metadata */
    const metaData = {...data,rows:undefined,trash:undefined,journal:{...data.journal,rows:undefined},khatas:data.khatas!==undefined?[]:undefined};
    if (metaData.partyCurrencies && Object.keys(metaData.partyCurrencies).length === 0) delete metaData.partyCurrencies;
    if (metaData.partyDateFilters && Object.keys(metaData.partyDateFilters).length === 0) delete metaData.partyDateFilters;
    const metadata = JSON.stringify(metaData);
    const nextCaches = {};
    const result = this.db.transaction(()=>{
      const head = this.headRevSelectStmt.get();
      /* FIX-11: machine-readable error codes */
      if (head.revision !== expectedRevision) throw new HisaabError('STALE_STATE: Reload before saving', 'STALE_STATE');
      if (head.revision >= Number.MAX_SAFE_INTEGER) throw new HisaabError('Revision overflow', 'REVISION_OVERFLOW');
      if (initialize && head.metadata !== null) throw new HisaabError('Database already initialized', 'ALREADY_INITIALIZED');
      if (!initialize && head.metadata === null) throw new HisaabError('Database is not initialized', 'NOT_INITIALIZED');
      /* FIX-5: collect all backup paths so migration backup is never lost when restore=true */
      const backupPaths = [];
      if (initialize && legacyRaw !== null) backupPaths.push(this.writeBackup('migration-localstorage',legacyRaw));
      if (restore) {
        const saved = this.load().state;
        if (saved) backupPaths.push(this.writeBackup('safety-pre-restore',JSON.stringify(saved,null,2)));
        if (currentData && (!saved || JSON.stringify(currentData) !== JSON.stringify(saved))) {
          backupPaths.push(this.writeBackup('safety-pre-restore',JSON.stringify(currentData,null,2)));
        }
      }
      for (const [table,records] of Object.entries(tables)){
        const old = this.caches[table], next = new Map(), stmt = this.statements[table];
        for (const record of records){const id=record[stmt.key],serialized=JSON.stringify(record);next.set(id,serialized);if(old.get(id)!==serialized)stmt.put.run(record);}
        for (const id of old.keys()) if(!next.has(id)) stmt.remove.run(id);
        nextCaches[table] = next;
      }
      this.headUpdateStmt.run(metadata,head.revision+1);
      const backupPath = backupPaths[0] || null;
      if (initialize) this.db.prepare('INSERT INTO migration_sources VALUES(1,?,?,?)').run(new Date().toISOString(),legacyRaw,backupPath);
      return {revision:head.revision+1,backupPath,backupPaths};
    }).immediate();
    this.caches = nextCaches;
    return result;
  }

  /* FIX-12: safe close that never throws and avoids undocumented db.open reliance */
  close() {
    if (this.db) {
      try {
        if (typeof this.db.close === 'function' && this.db.open) this.db.close();
      } catch {}
      this.db = null;
    }
  }
}

HisaabDatabase.HisaabError = HisaabError;
validateState.HisaabError = HisaabError;

module.exports = { HisaabDatabase, validateState, HisaabError };
