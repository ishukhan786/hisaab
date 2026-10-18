'use strict';
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_BYTES = 15_000_000;
const fields = ['sender','mobile','receiver','place','branch','balance','aed','pkr'];
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const text = (value, max) => typeof value === 'string' && value.length <= max;
function invalid(message) { throw new Error('Invalid data: ' + message); }

// Amounts remain exact text, including an unfinished edit, rather than floating
// point values. UI calculations continue to use BigInt and flag invalid input.
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
  for (const name of parties) {
    if (Object.hasOwn(data.partyCurrencies || {},name) && !['pkr','afn'].includes(data.partyCurrencies[name])) invalid('currency');
  }
  const ids = new Set();
  const registerRow = row => {
    if (!row || !text(row.id,99) || ids.has(row.id) || !validDate(row.entryDate) || fields.some(f => !text(row[f],300))) invalid('entry');
    ids.add(row.id);
    if (row.branch && !parties.has(row.branch)) invalid('missing party');
    if (row.history !== undefined && (!Array.isArray(row.history) || row.history.length > 30 || row.history.some(h => !h || ['at','field','from','to'].some(f => !text(h[f],2000))))) invalid('history');
  };
  data.rows.forEach(registerRow);
  if (!Array.isArray(data.trash) || data.trash.length > 20) invalid('trash');
  for (const item of data.trash) {
    if (!item || !Number.isInteger(item.index) || item.index < 0) invalid('trash index');
    registerRow(item.row);
  }
  if (!data.journal || !validDate(data.journal.date) || !Array.isArray(data.journal.rows) || data.journal.rows.length > 10001) invalid('journal');
  if(data.journal.cashCounts!==undefined){
    const counts=data.journal.cashCounts;
    if(!counts||typeof counts!=='object'||Array.isArray(counts)||Object.keys(counts).length>10000)invalid('cash counts');
    for(const [date,value] of Object.entries(counts))if(!validDate(date)||!text(value,40))invalid('cash count');
  }
  const journalIds = new Set();
  for (const row of data.journal.rows) {
    if (!row || !text(row.id,99) || journalIds.has(row.id) || !validDate(row.date) || !text(row.detail,2000) || !text(row.debit,40) || !text(row.credit,40)) invalid('journal entry');
    journalIds.add(row.id);
  }
  // Empty drafts are UI state, not durable records.
  data.rows = data.rows.filter(r => fields.filter(f => f !== 'branch').some(f => r[f].trim()));
  data.journal.rows = data.journal.rows.filter(r => ['detail','debit','credit'].some(f => r[f].trim()));
  return data;
}

class HisaabDatabase {
  constructor(filename) {
    fs.mkdirSync(path.dirname(filename),{recursive:true});
    this.filename = filename;
    this.backupDir = path.join(path.dirname(filename),'backups');
    this.db = new Database(filename,{timeout:2000});
    try {
      const version = this.db.pragma('user_version',{simple:true});
      if (version !== 0 && version !== 1) throw new Error('Unsupported database version');
      if (this.db.pragma('quick_check',{simple:true}) !== 'ok') throw new Error('Database integrity check failed');
      if (version === 0 && this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length) throw new Error('Unknown database schema');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
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
          CREATE TABLE migration_sources (id INTEGER PRIMARY KEY CHECK(id=1), imported_at TEXT NOT NULL, legacy_json TEXT, backup_path TEXT);
          PRAGMA user_version = 1;
        `);
      })();
      if (this.db.pragma('foreign_key_check').length) throw new Error('Database references are damaged');
      this.statements = {};
      this.caches = {};
      for (const table of ['parties','register_entries','journal_entries','trash_entries']) {
        const key = table === 'parties' ? 'name' : 'id';
        const columns = table === 'parties' ? ['name','currency','position'] : table === 'register_entries' ? ['id','position','entry_date','party','data'] : table === 'journal_entries' ? ['id','position','entry_date','data'] : ['id','position','data'];
        this.statements[table] = {
          put:this.db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(c=>'@'+c).join(',')}) ON CONFLICT(${key}) DO UPDATE SET ${columns.filter(c=>c!==key).map(c=>c+'=excluded.'+c).join(',')}`),
          remove:this.db.prepare(`DELETE FROM ${table} WHERE ${key}=?`),
          key
        };
        this.caches[table] = new Map(this.db.prepare(`SELECT * FROM ${table}`).all().map(r=>[r[key],JSON.stringify(r)]));
      }
      this.load(); // Validate the reconstructed state before permitting writes.
    } catch (error) { this.db.close(); throw error; }
  }

  load() {
    const head = this.db.prepare('SELECT * FROM app_state WHERE id=1').get();
    if (!head) throw new Error('Missing database metadata');
    if (head.metadata === null) return {state:null,revision:head.revision};
    const metadata = JSON.parse(head.metadata);
    const read = table => this.db.prepare(`SELECT data FROM ${table} ORDER BY position`).all().map(r=>JSON.parse(r.data));
    return {state:validateState({...metadata,rows:read('register_entries'),trash:read('trash_entries'),journal:{...metadata.journal,rows:read('journal_entries')}}),revision:head.revision};
  }

  writeBackup(prefix,content) {
    fs.mkdirSync(this.backupDir,{recursive:true});
    const target = path.join(this.backupDir,`${prefix}_${new Date().toISOString().replace(/[:.]/g,'-')}_${randomUUID()}.json`);
    let fd;
    try { fd=fs.openSync(target,'wx');fs.writeFileSync(fd,content,'utf8');fs.fsyncSync(fd); }
    catch(error) { if(fd!==undefined){fs.closeSync(fd);fd=undefined;}try{fs.unlinkSync(target);}catch{}throw error; }
    finally { if(fd!==undefined)fs.closeSync(fd); }
    return target;
  }

  commit(input,expectedRevision,{initialize=false,legacyRaw=null,restore=false,current=null}={}) {
    const data = validateState(input);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Invalid revision');
    if (legacyRaw !== null && (!text(legacyRaw,MAX_BYTES) || Buffer.byteLength(legacyRaw)>MAX_BYTES)) invalid('legacy source');
    const currentData = current === null ? null : validateState(current);
    const tables = {
      parties:data.branches.map((name,position)=>({name,currency:data.partyCurrencies?.[name]==='afn'?'afn':'pkr',position})),
      register_entries:data.rows.map((row,position)=>({id:row.id,position,entry_date:row.entryDate,party:row.branch||null,data:JSON.stringify(row)})),
      journal_entries:data.journal.rows.map((row,position)=>({id:row.id,position,entry_date:row.date,data:JSON.stringify(row)})),
      trash_entries:data.trash.map((item,position)=>({id:item.row.id,position,data:JSON.stringify(item)}))
    };
    const metadata=JSON.stringify({...data,rows:undefined,trash:undefined,journal:{...data.journal,rows:undefined}});
    const nextCaches={};
    const result=this.db.transaction(()=>{
      const head=this.db.prepare('SELECT revision,metadata FROM app_state WHERE id=1').get();
      if(head.revision!==expectedRevision)throw new Error('STALE_STATE: Reload before saving');
      if(initialize&&head.metadata!==null)throw new Error('Database already initialized');
      if(!initialize&&head.metadata===null)throw new Error('Database is not initialized');
      let backupPath=null;
      if(initialize&&legacyRaw!==null)backupPath=this.writeBackup('migration-localstorage',legacyRaw);
      if(restore){
        const saved=this.load().state;
        backupPath=this.writeBackup('safety-pre-restore',JSON.stringify(saved,null,2));
        if(currentData&&JSON.stringify(currentData)!==JSON.stringify(saved))this.writeBackup('safety-pre-restore',JSON.stringify(currentData,null,2));
      }
      for(const [table,records] of Object.entries(tables)){
        const old=this.caches[table],next=new Map(),stmt=this.statements[table];
        for(const record of records){const id=record[stmt.key],serialized=JSON.stringify(record);next.set(id,serialized);if(old.get(id)!==serialized)stmt.put.run(record);}
        for(const id of old.keys())if(!next.has(id))stmt.remove.run(id);
        nextCaches[table]=next;
      }
      this.db.prepare('UPDATE app_state SET metadata=?,revision=? WHERE id=1').run(metadata,head.revision+1);
      if(initialize)this.db.prepare('INSERT INTO migration_sources VALUES(1,?,?,?)').run(new Date().toISOString(),legacyRaw,backupPath);
      return {revision:head.revision+1,backupPath};
    }).immediate();
    this.caches=nextCaches;
    return result;
  }
  close(){if(this.db?.open)this.db.close();}
}
module.exports={HisaabDatabase,validateState};
