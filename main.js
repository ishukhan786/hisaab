const { app, BrowserWindow, Menu, MenuItem, dialog, shell, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');

app.setAppUserModelId('com.ishukhan.hisaab');

let mainWindow = null;
const officeDatabases = new Map();
function getDatabase(office = 'mussafah') {
  if (!['mussafah','satwa','city'].includes(office)) throw Error('Invalid office branch');
  if (!officeDatabases.has(office)) {
    const { HisaabDatabase } = require('./database');
    const filename = office === 'mussafah' ? 'hisaab.sqlite' : `hisaab-${office}.sqlite`;
    officeDatabases.set(office, new HisaabDatabase(path.join(app.getPath('userData'),filename),{backupDir:path.join(officeDirectory(office),'backups')}));
  }
  return officeDatabases.get(office);
}

// Only the trusted top-level application frame can read or mutate local data.
for (const action of ['load','initialize','save','restore']) {
  ipcMain.on('database-'+action,(event,payload={})=>{
    try {
      const expectedURL=require('url').pathToFileURL(path.join(__dirname,'index.html')).href;
      if (!gotTheLock || !mainWindow || event.sender!==mainWindow.webContents || event.senderFrame!==mainWindow.webContents.mainFrame || event.senderFrame.url!==expectedURL) throw new Error('Unauthorized database request');
      const store=getDatabase(payload.office || 'mussafah');
      if(action==='load')event.returnValue={status:'ok',...store.load(),filePath:store.filename};
      else {
        if(payload.state?.officeId && payload.state.officeId !== (payload.office||'mussafah'))throw Error('Backup belongs to another branch');
        const options=action==='initialize'?{initialize:true,legacyRaw:payload.legacyRaw??null}:action==='restore'?{restore:true,current:payload.current}:{};
        event.returnValue={status:'saved',...store.commit(payload.state,payload.revision,options)};
      }
    } catch(error) {
      console.error('Database '+action+' failed:',error.message);
      event.returnValue={status:'error',message:error.message};
    }
  });
}

function isSameFrameUrl(frameUrl, targetUrl) {
  if (frameUrl === targetUrl) return true;
  if (!frameUrl || !targetUrl) return false;
  try {
    return decodeURI(frameUrl).toLowerCase() === decodeURI(targetUrl).toLowerCase();
  } catch (_) {
    return frameUrl.toLowerCase() === targetUrl.toLowerCase();
  }
}

function officeDirectory(office='mussafah') {
  if(!['mussafah','satwa','city'].includes(office))throw Error('Invalid office branch');
  return office==='mussafah'?app.getPath('userData'):path.join(app.getPath('userData'),'offices',office);
}
const externalBackups=new Map();
function getExternalBackup(office='mussafah'){
  const dir=officeDirectory(office);
  if(!externalBackups.has(office))externalBackups.set(office,new (require('./external-backup.cjs').ExternalBackup)(dir));
  return externalBackups.get(office);
}
function trustedBackupFrame(event){const url=require('url').pathToFileURL(path.join(__dirname,'index.html')).href;if(!gotTheLock||!mainWindow||event.sender!==mainWindow.webContents||event.senderFrame!==mainWindow.webContents.mainFrame||!isSameFrameUrl(event.senderFrame.url,url))throw Error('Unauthorized backup request');}
ipcMain.handle('external-backup-status',async (event,office)=>{trustedBackupFrame(event);return getExternalBackup(office).status();});
ipcMain.handle('external-backup-select',async(event,office)=>{
  trustedBackupFrame(event);
  const result=await dialog.showOpenDialog(mainWindow,{title:'بیک اَپ کے لیے USB یا synced فولڈر منتخب کریں',properties:['openDirectory','createDirectory']});
  if(result.canceled || !result.filePaths || !result.filePaths.length || !result.filePaths[0])return {cancelled:true};
  return getExternalBackup(office).configure(result.filePaths[0]);
});
ipcMain.handle('external-backup-disable',async(event,office)=>{trustedBackupFrame(event);return getExternalBackup(office).configure(null);});
ipcMain.handle('external-backup-save',async(event,data,office)=>{
  trustedBackupFrame(event);
  try {
    const validated = require('./database').validateState(data);
    return await getExternalBackup(office).save(validated);
  } catch (err) {
    const config = await getExternalBackup(office).status();
    return { status: 'error', ...config, error: err.message };
  }
});

app.on('will-quit',()=>{for(const store of officeDatabases.values())store.close();});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
}

async function getBackupsDir(office='mussafah') {
  const dir = path.join(officeDirectory(office), 'backups');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

let pdfBusy = false;
let receiptPNGBusy = false;
const receiptFields = ['title','serial','date','branch','sender','mobile','receiver','place','balance','aed','pkr','currency'];

async function renderReceiptImage(values) {
  let renderer;
  try {
    renderer = new BrowserWindow({width:560,height:794,useContentSize:true,show:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    // Windows clamps the initial window to the display; explicitly size the render surface.
    renderer.setContentSize(560,794);
    renderer.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    await renderer.loadFile(path.join(__dirname,'receipt-image.html'));
    const data = Object.fromEntries(receiptFields.map(key=>[key,values[key]]));
    const receiptSize=await renderer.webContents.executeJavaScript(`(async()=>{
      const values=${JSON.stringify(data)};
      document.querySelectorAll('[data-receipt]').forEach(el=>{el.textContent=values[el.dataset.receipt];});
      await document.fonts.ready;
      const sheet=document.getElementById('receipt-paper');
      sheet.style.left='10mm';sheet.style.top='10mm';
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {width:560,height:Math.max(794,Math.ceil(sheet.scrollHeight+76))};
    })()`);
    renderer.setContentSize(receiptSize.width,receiptSize.height);
    // Wait for the compositor to paint the populated receipt, not the initial blank template.
    await new Promise(resolve=>setTimeout(resolve,300));
    const captured = await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{renderer.webContents.removeListener('paint',painted);reject(new Error('Receipt paint timeout'));},5000);
      function painted(_event,_dirty,image){clearTimeout(timer);resolve(image);}
      renderer.webContents.once('paint',painted);
      renderer.webContents.invalidate();
    });
    if (captured.isEmpty()) throw new Error('Empty receipt image');
    return captured.resize({width:1600,quality:'best'});
  } finally {
    if (renderer && !renderer.isDestroyed()) renderer.destroy();
  }
}

ipcMain.handle('save-receipt-png', async (event, values, suggestedName) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unauthorized PNG request');
  if (!values || typeof values !== 'object' || receiptFields.some(key => typeof values[key] !== 'string' || values[key].length > 2000) || typeof suggestedName !== 'string') throw new Error('Invalid receipt');
  if (receiptPNGBusy) return {status:'busy'};
  receiptPNGBusy = true;
  let temporary;
  try {
    let name = suggestedName.replace(/\.png$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').trim().slice(0,160) || 'Hisaab-Receipt';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = 'Hisaab-' + name;
    const result = await dialog.showSaveDialog(mainWindow,{title:'رسید کی تصویر محفوظ کریں',defaultPath:path.join(app.getPath('documents'),name+'.png'),filters:[{name:'PNG Image',extensions:['png']}],properties:['showOverwriteConfirmation','createDirectory']});
    if (result.canceled || !result.filePath) return {status:'cancelled'};
    const target = /\.png$/i.test(result.filePath) ? result.filePath : result.filePath+'.png';
    const image = await renderReceiptImage(values);
    const png = image.toPNG();
    temporary = path.join(path.dirname(target),'.hisaab-png-'+randomUUID()+'.tmp');
    await fs.writeFile(temporary,png,{flag:'wx'});
    await fs.rename(temporary,target);temporary=null;
    return {status:'saved',filePath:target};
  } catch { return {status:'error'}; }
  finally {
    if (temporary) await fs.unlink(temporary).catch(()=>{});
    receiptPNGBusy=false;
  }
});

ipcMain.handle('copy-receipt-png', async (event, values) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unauthorized PNG request');
  if (!values || typeof values !== 'object' || receiptFields.some(key => typeof values[key] !== 'string' || values[key].length > 2000)) throw new Error('Invalid receipt');
  if (receiptPNGBusy) return {status:'busy'};
  receiptPNGBusy = true;
  try {
    const image = await renderReceiptImage(values);
    clipboard.writeImage(image);
    return {status:'copied'};
  } catch { return {status:'error'}; }
  finally { receiptPNGBusy=false; }
});
ipcMain.handle('preview-pdf', async event => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unauthorized PDF request');
  if (pdfBusy) return {status:'busy'};
  pdfBusy=true;
  let preview, temporary;
  try {
    const pdf=await event.sender.printToPDF({printBackground:true,landscape:true,pageSize:'A4',preferCSSPageSize:true,displayHeaderFooter:false});
    temporary=path.join(app.getPath('temp'),'hisaab-preview-'+randomUUID()+'.pdf');
    await fs.writeFile(temporary,pdf,{flag:'wx'});
    preview=new BrowserWindow({parent:mainWindow,width:1150,height:850,title:'حساب — پرنٹ پیش منظر',show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,plugins:true}});
    preview.setMenu(null);
    preview.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    const file=temporary;
    preview.on('closed',()=>{fs.unlink(file).catch(()=>{});});
    await preview.loadFile(file);
    preview.show();
    return {status:'opened'};
  } catch(error) {
    if(preview&&!preview.isDestroyed())preview.close();
    if(temporary)await fs.unlink(temporary).catch(()=>{});
    return {status:'error'};
  } finally {pdfBusy=false;}
});

ipcMain.handle('save-pdf', async (event, suggestedName) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unauthorized PDF request');
  if (pdfBusy) return { status: 'busy' };
  if (typeof suggestedName !== 'string') throw new Error('Invalid PDF name');
  let name = suggestedName.replace(/\.pdf$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').trim().slice(0,160);
  if (!name) name = 'Hisaab';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = 'Hisaab-' + name;
  pdfBusy = true;
  let temporary;
  try {
    const result = await dialog.showSaveDialog(mainWindow, {title:'PDF محفوظ کریں', defaultPath:path.join(app.getPath('documents'),name+'.pdf'), filters:[{name:'PDF',extensions:['pdf']}], properties:['showOverwriteConfirmation','createDirectory']});
    if (result.canceled || !result.filePath) return {status:'cancelled'};
    const target = /\.pdf$/i.test(result.filePath) ? result.filePath : result.filePath+'.pdf';
    const pdf = await event.sender.printToPDF({printBackground:true,landscape:true,pageSize:'A4',preferCSSPageSize:true,displayHeaderFooter:false});
    temporary = path.join(path.dirname(target),'.hisaab-pdf-'+randomUUID()+'.tmp');
    await fs.writeFile(temporary,pdf,{flag:'wx'});
    await fs.rename(temporary,target);
    temporary = null;
    return {status:'saved', filePath: target};
  } catch(error) {
    return {status:'error'};
  } finally {
    if (temporary) await fs.unlink(temporary).catch(()=>{});
    pdfBusy = false;
  }
});

ipcMain.handle('save-auto-backup', async (event, data, isSafety = false,office='mussafah') => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  if (!data || typeof data !== 'object') throw new Error('Invalid backup payload');
  try {
    const dir = await getBackupsDir(office);
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const prefix = isSafety ? 'safety-pre-restore' : 'auto-backup';
    const filename = `${prefix}_${dateStr}_${timeStr}_${randomUUID()}.json`;
    const target = path.join(dir, filename);
    const temp = path.join(dir, `.tmp-${randomUUID()}.json`);

    await fs.writeFile(temp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(temp, target);

    // Retention policy: keep 30 auto-backups, and 10 safety snapshots
    try {
      const files = await fs.readdir(dir);
      const autoFiles = files.filter(f => f.startsWith('auto-backup_') && f.endsWith('.json')).sort();
      if (autoFiles.length > 30) {
        const toDelete = autoFiles.slice(0, autoFiles.length - 30);
        for (const file of toDelete) {
          await fs.unlink(path.join(dir, file)).catch(() => {});
        }
      }
      const safetyFiles = files.filter(f => f.startsWith('safety-pre-restore_') && f.endsWith('.json')).sort();
      if (safetyFiles.length > 10) {
        const toDelete = safetyFiles.slice(0, safetyFiles.length - 10);
        for (const file of toDelete) {
          await fs.unlink(path.join(dir, file)).catch(() => {});
        }
      }
    } catch (_) {}

    return { status: 'saved', filename, filePath: target };
  } catch (err) {
    return { status: 'error', message: err.message };
  }
});

ipcMain.handle('get-auto-backups', async (event,office='mussafah') => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  try {
    const dir = await getBackupsDir(office);
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith('.json') && (f.startsWith('auto-backup_') || f.startsWith('safety-pre-restore_') || f.startsWith('migration-localstorage_')));
    const list = [];
    for (const f of jsonFiles) {
      try {
        const stat = await fs.stat(path.join(dir, f));
        list.push({
          name: f,
          isSafety: f.startsWith('safety-pre-restore_'),
          size: stat.size,
          mtime: stat.mtimeMs,
          path: path.join(dir, f)
        });
      } catch (_) {}
    }
    list.sort((a, b) => b.mtime - a.mtime);
    return { status: 'ok', backups: list, dir };
  } catch (err) {
    return { status: 'error', backups: [], message: err.message };
  }
});

ipcMain.handle('read-auto-backup', async (event, filename,office='mussafah') => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  if (typeof filename !== 'string' || !/^(auto-backup_|safety-pre-restore_|migration-localstorage_)[a-zA-Z0-9_\-\.]+\.json$/.test(filename)) {
    throw new Error('Invalid filename');
  }
  const dir = await getBackupsDir(office);
  const filePath = path.join(dir, filename);
  const content = await fs.readFile(filePath, 'utf-8');
  return { status: 'ok', content };
});

ipcMain.handle('open-backups-folder', async (event,office='mussafah') => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  const dir = await getBackupsDir(office);
  await shell.openPath(dir);
  return { status: 'ok' };
});

ipcMain.handle('open-file', async (event, targetPath) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  if (typeof targetPath !== 'string') throw new Error('Invalid path');
  await shell.openPath(targetPath);
  return { status: 'ok' };
});

ipcMain.handle('show-in-folder', async (event, targetPath) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  if (typeof targetPath !== 'string') throw new Error('Invalid path');
  shell.showItemInFolder(targetPath);
  return { status: 'ok' };
});

function createWindow() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'حساب — اندراج رجسٹر',
    icon: iconPath,
    backgroundColor: '#f3f5f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    },
    show: false
  });

  mainWindow.maximize();
  mainWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  mainWindow.webContents.on('will-navigate',(event,url)=>{
    const expected=require('url').pathToFileURL(path.join(__dirname,'index.html')).href;
    if(!isSameFrameUrl(url,expected))event.preventDefault();
  });
  mainWindow.webContents.on('will-prevent-unload',event=>{
    const choice=dialog.showMessageBoxSync(mainWindow,{type:'warning',title:'غیر محفوظ تبدیلیاں',message:'کچھ تبدیلیاں محفوظ نہیں ہو سکیں۔ واپس جا کر دوبارہ محفوظ کریں یا بیک اَپ لیں۔',buttons:['واپس جائیں','بغیر محفوظ کیے بند کریں'],defaultId:0,cancelId:0});
    if(choice===1)event.preventDefault();
  });
  mainWindow.webContents.on('context-menu', (event, params) => {
    const contextMenu = new Menu();
    if (params.isEditable) {
      contextMenu.append(new MenuItem({ role: 'undo', label: 'واپس (Undo)' }));
      contextMenu.append(new MenuItem({ role: 'redo', label: 'دوبارہ (Redo)' }));
      contextMenu.append(new MenuItem({ type: 'separator' }));
      contextMenu.append(new MenuItem({ role: 'cut', label: 'کٹ (Cut)', enabled: params.editFlags.canCut }));
      contextMenu.append(new MenuItem({ role: 'copy', label: 'کاپی (Copy)', enabled: params.editFlags.canCopy }));
      contextMenu.append(new MenuItem({ role: 'paste', label: 'پیسٹ (Paste)', enabled: params.editFlags.canPaste }));
      contextMenu.append(new MenuItem({ role: 'pasteAndMatchStyle', label: 'پیسٹ (سادہ ٹیکسٹ)', enabled: params.editFlags.canPaste }));
      contextMenu.append(new MenuItem({ type: 'separator' }));
      contextMenu.append(new MenuItem({ role: 'selectAll', label: 'تمام منتخب کریں (Select All)', enabled: params.editFlags.canSelectAll }));
      contextMenu.popup({ window: mainWindow });
    } else if (params.selectionText && params.selectionText.trim().length > 0) {
      contextMenu.append(new MenuItem({ role: 'copy', label: 'کاپی (Copy)' }));
      contextMenu.popup({ window: mainWindow });
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  buildMenu();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-action', action);
  }
}

function buildMenu() {
  const template = [
    {
      label: 'فائل (File)',
      submenu: [
        {
          label: 'نئی قطار (New Row)',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendAction('add-row')
        },
        {
          label: 'پرنٹ کریں (Print)',
          accelerator: 'CmdOrCtrl+P',
          click: () => sendAction('print')
        },
        {
          label: 'Excel ایکسپورٹ (Export)',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendAction('export')
        },
        { type: 'separator' },
        {
          label: 'بند کریں (Exit)',
          accelerator: 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'ترمیم (Edit)',
      submenu: [
        { role: 'undo', label: 'واپس (Undo)' },
        { role: 'redo', label: 'دوبارہ (Redo)' },
        { type: 'separator' },
        { role: 'cut', label: 'کٹ (Cut)' },
        { role: 'copy', label: 'کاپی (Copy)' },
        { role: 'paste', label: 'پیسٹ (Paste)' },
        { role: 'pasteAndMatchStyle', label: 'پیسٹ اور فارمیٹ ملائیں' },
        { role: 'delete', label: 'حذف (Delete)' },
        { type: 'separator' },
        { role: 'selectAll', label: 'تمام منتخب کریں (Select All)' }
      ]
    },
    {
      label: 'کھاتہ (Ledger)',
      submenu: [
        {
          label: 'روزانہ خلاصہ (Daily Summary)',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendAction('summary')
        },
        {
          label: 'پارٹیاں سنبھالیں (Manage Parties)',
          accelerator: 'CmdOrCtrl+M',
          click: () => sendAction('branches')
        },
        {
          label: 'فلٹر صاف کریں (Reset Filters)',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendAction('reset-filters')
        }
      ]
    },
    {
      label: 'ویو (View)',
      submenu: [
        { role: 'reload', label: 'ریفریش کریں (Reload)' },
        { role: 'forceReload', label: 'زبردستی ریفریش (Force Reload)' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'اصل سائز (Reset Zoom)' },
        { role: 'zoomIn', label: 'بڑا کریں (Zoom In)' },
        { role: 'zoomOut', label: 'چھوٹا کریں (Zoom Out)' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'فل اسکرین (Toggle Fullscreen)' }
      ]
    },
    {
      label: 'مدد (Help)',
      submenu: [
        {
          label: 'استعمال کی رہنمائی (User Guide)',
          click: () => {
            const guide=new BrowserWindow({parent:mainWindow,width:850,height:720,title:'حساب — رہنمائی',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});guide.setMenu(null);guide.loadFile(path.join(__dirname,'guide.html'));
          }
        },
        {
          label: 'GitHub ریپازٹری (Online)',
          click: () => {
            shell.openExternal('https://github.com/ishukhan786/hisaab');
          }
        },
        { type: 'separator' },
        {
          label: 'حساب کے متعلق (About)',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'حساب — اندراج رجسٹر',
              message: `حساب (Hisaab Desktop App) — ورژن ${app.getVersion()}`,
              detail: 'آف لائن روزانہ کھاتہ، اندراج رجسٹر، پارٹی کھاتے، پرنٹ اور ایکسل ایکسپورٹ سسٹم۔\n\nتمام ڈیٹا آپ کے کمپیوٹر میں محفوظ رہتا ہے۔\nتیار کردہ: ishukhan786',
              buttons: ['ٹھیک ہے']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
