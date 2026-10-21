const {ExternalBackup}=require('../external-backup.cjs'),fs=require('fs/promises'),path=require('path'),assert=require('assert');
const delay = ms => new Promise(r => setTimeout(r, ms));
async function safeRename(from, to, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (err.code === 'EPERM' && i < retries - 1) {
        await delay(100 * (i + 1));
      } else {
        throw err;
      }
    }
  }
}
(async()=>{const root=path.resolve('scratch/external-backup-'+Date.now()),profile=path.join(root,'profile'),folder=path.join(root,'usb');await fs.mkdir(profile,{recursive:true});await fs.mkdir(folder);const store=new ExternalBackup(profile);assert.equal((await store.save({})).status,'disabled');await store.configure(folder);for(let i=0;i<32;i++)assert.equal((await store.save({version:4,n:i})).status,'saved');const files=await fs.readdir(path.join(folder,'Hisaab-Backups'));assert.equal(files.length,30);const last=(await store.status()).lastSuccess;const restart=new ExternalBackup(profile);assert.equal((await restart.status()).folder,folder);await safeRename(folder,folder+'-removed');assert.equal((await restart.save({n:33})).status,'error');assert.equal((await restart.status()).lastSuccess,last);await assert.rejects(fs.stat(folder));await safeRename(folder+'-removed',folder);assert.equal((await restart.save({n:34})).status,'saved');assert.equal((await restart.status()).error,null);await restart.configure(null);assert.equal((await restart.save({n:35})).status,'disabled');console.log('PASS external backup actual files, retention, saved settings, missing USB does not recreate root, last-success preservation, retry and disable');console.log(root);})().catch(e=>{console.error(e);process.exit(1)});
