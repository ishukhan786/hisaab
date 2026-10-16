const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { randomUUID } = require('crypto');

app.setAppUserModelId('com.ishukhan.hisaab');

let mainWindow = null;

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

async function getBackupsDir() {
  const dir = path.join(app.getPath('userData'), 'backups');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

let pdfBusy = false;
let receiptPNGBusy = false;
ipcMain.handle('save-receipt-png', async (event, values, suggestedName) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) throw new Error('Unauthorized PNG request');
  const fields = ['title','serial','date','branch','sender','mobile','receiver','place','balance','aed','pkr','currency'];
  if (!values || typeof values !== 'object' || fields.some(key => typeof values[key] !== 'string' || values[key].length > 2000) || typeof suggestedName !== 'string') throw new Error('Invalid receipt');
  if (receiptPNGBusy) return {status:'busy'};
  receiptPNGBusy = true;
  let renderer, temporary;
  try {
    let name = suggestedName.replace(/\.png$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').trim().slice(0,160) || 'Hisaab-Receipt';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = 'Hisaab-' + name;
    const result = await dialog.showSaveDialog(mainWindow,{title:'رسید کی تصویر محفوظ کریں',defaultPath:path.join(app.getPath('documents'),name+'.png'),filters:[{name:'PNG Image',extensions:['png']}],properties:['showOverwriteConfirmation','createDirectory']});
    if (result.canceled || !result.filePath) return {status:'cancelled'};
    const target = /\.png$/i.test(result.filePath) ? result.filePath : result.filePath+'.png';
    renderer = new BrowserWindow({width:1600,height:1600,useContentSize:true,show:false,webPreferences:{offscreen:true,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    // Windows clamps the initial window to the display; explicitly size the render surface.
    renderer.setContentSize(1600,1600);
    renderer.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    await renderer.loadFile(path.join(__dirname,'receipt-image.html'));
    const data = Object.fromEntries(fields.map(key=>[key,values[key]]));
    await renderer.webContents.executeJavaScript(`(async()=>{
      const values=${JSON.stringify(data)};
      document.querySelectorAll('[data-receipt]').forEach(el=>{el.textContent=values[el.dataset.receipt];});
      await document.fonts.ready;
      const sheet=document.getElementById('receipt-paper');
      const width=sheet.offsetWidth,height=sheet.scrollHeight;
      const scale=Math.min((innerWidth-80)/width,(innerHeight-80)/height);
      sheet.style.transform='scale('+scale+')';
      sheet.style.left=((innerWidth-width*scale)/2)+'px';
      sheet.style.top=((innerHeight-height*scale)/2)+'px';
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    })()`);
    // Wait for the compositor to paint the populated receipt, not the initial blank template.
    await new Promise(resolve=>setTimeout(resolve,300));
    const captured = await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{renderer.webContents.removeListener('paint',painted);reject(new Error('Receipt paint timeout'));},5000);
      function painted(_event,_dirty,image){clearTimeout(timer);resolve(image);}
      renderer.webContents.once('paint',painted);
      renderer.webContents.invalidate();
    });
    if (captured.isEmpty()) throw new Error('Empty receipt image');
    const png = captured.resize({width:1600,height:1600,quality:'best'}).toPNG();
    temporary = path.join(path.dirname(target),'.hisaab-png-'+randomUUID()+'.tmp');
    await fs.writeFile(temporary,png,{flag:'wx'});
    await fs.rename(temporary,target);temporary=null;
    return {status:'saved',filePath:target};
  } catch { return {status:'error'}; }
  finally {
    if (renderer && !renderer.isDestroyed()) renderer.destroy();
    if (temporary) await fs.unlink(temporary).catch(()=>{});
    receiptPNGBusy=false;
  }
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

ipcMain.handle('save-auto-backup', async (event, data, isSafety = false) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  if (!data || typeof data !== 'object') throw new Error('Invalid backup payload');
  try {
    const dir = await getBackupsDir();
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
    const prefix = isSafety ? 'safety-pre-restore' : 'auto-backup';
    const filename = `${prefix}_${dateStr}_${timeStr}.json`;
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

ipcMain.handle('get-auto-backups', async (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  try {
    const dir = await getBackupsDir();
    const files = await fs.readdir(dir);
    const jsonFiles = files.filter(f => f.endsWith('.json') && (f.startsWith('auto-backup_') || f.startsWith('safety-pre-restore_')));
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

ipcMain.handle('read-auto-backup', async (event, filename) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  if (typeof filename !== 'string' || !/^(auto-backup_|safety-pre-restore_)[a-zA-Z0-9_\-\.]+\.json$/.test(filename)) {
    throw new Error('Invalid filename');
  }
  const dir = await getBackupsDir();
  const filePath = path.join(dir, filename);
  const content = await fs.readFile(filePath, 'utf-8');
  return { status: 'ok', content };
});

ipcMain.handle('open-backups-folder', async (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Unauthorized');
  const dir = await getBackupsDir();
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
  mainWindow.webContents.on('will-navigate',event=>event.preventDefault());
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
