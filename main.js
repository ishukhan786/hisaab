const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');

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
            shell.openPath(path.join(__dirname, 'README.md'));
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
              message: 'حساب (Hisaab Desktop App) — ورژن 1.0.0',
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
