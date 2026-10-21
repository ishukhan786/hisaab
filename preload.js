const { contextBridge, ipcRenderer } = require('electron');
let office = 'mussafah';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  externalBackup:{status:()=>ipcRenderer.invoke('external-backup-status',office),select:()=>ipcRenderer.invoke('external-backup-select',office),disable:()=>ipcRenderer.invoke('external-backup-disable',office),save:data=>ipcRenderer.invoke('external-backup-save',data,office)},
  storage: {
    setOffice: value => { if (!['mussafah','satwa','city'].includes(value)) throw Error('Invalid office'); office=value; },
    load: () => ipcRenderer.sendSync('database-load',{office}),
    initialize: (state, legacyRaw, revision) => ipcRenderer.sendSync('database-initialize',{state,legacyRaw,revision,office}),
    save: (state, revision) => ipcRenderer.sendSync('database-save',{state,revision,office}),
    restore: (state, revision, current) => ipcRenderer.sendSync('database-restore',{state,revision,current,office})
  },
  saveReceiptPNG: (values, name) => ipcRenderer.invoke('save-receipt-png', values, name),
  copyReceiptPNG: (values) => ipcRenderer.invoke('copy-receipt-png', values),
  previewPDF: () => ipcRenderer.invoke('preview-pdf'),
  savePDF: (suggestedName) => ipcRenderer.invoke('save-pdf', suggestedName),
  openFile: (filePath) => ipcRenderer.invoke('open-file', filePath),
  showInFolder: (filePath) => ipcRenderer.invoke('show-in-folder', filePath),
  saveAutoBackup: (data, isSafety) => ipcRenderer.invoke('save-auto-backup', data, isSafety,office),
  getAutoBackups: () => ipcRenderer.invoke('get-auto-backups',office),
  readAutoBackup: (filename) => ipcRenderer.invoke('read-auto-backup', filename,office),
  openBackupsFolder: () => ipcRenderer.invoke('open-backups-folder',office),
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action));
  }
});
