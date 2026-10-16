const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  saveReceiptPNG: (values, name) => ipcRenderer.invoke('save-receipt-png', values, name),
  copyReceiptPNG: (values) => ipcRenderer.invoke('copy-receipt-png', values),
  previewPDF: () => ipcRenderer.invoke('preview-pdf'),
  savePDF: (suggestedName) => ipcRenderer.invoke('save-pdf', suggestedName),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  saveAutoBackup: (data, isSafety) => ipcRenderer.invoke('save-auto-backup', data, isSafety),
  getAutoBackups: () => ipcRenderer.invoke('get-auto-backups'),
  readAutoBackup: (filename) => ipcRenderer.invoke('read-auto-backup', filename),
  openBackupsFolder: () => ipcRenderer.invoke('open-backups-folder'),
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action));
  }
});
