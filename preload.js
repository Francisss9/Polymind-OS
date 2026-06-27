const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('polymind', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (payload) => ipcRenderer.invoke('config:set', payload),
  },
  notion: {
    test: (payload) => ipcRenderer.invoke('notion:test', payload),
  },
  trades: {
    getCached: () => ipcRenderer.invoke('trades:getCached'),
    sync: () => ipcRenderer.invoke('trades:sync'),
    create: (trade) => ipcRenderer.invoke('trades:create', trade),
    update: (trade) => ipcRenderer.invoke('trades:update', trade),
    delete: (id) => ipcRenderer.invoke('trades:delete', id),
  },
  habits: {
    getCached: () => ipcRenderer.invoke('habits:getCached'),
    sync: () => ipcRenderer.invoke('habits:sync'),
    updateCheckbox: (pageId, habitName, checked) =>
      ipcRenderer.invoke('habits:updateCheckbox', { pageId, habitName, checked }),
  },
  goals: {
    getCached: () => ipcRenderer.invoke('goals:getCached'),
    sync: () => ipcRenderer.invoke('goals:sync'),
    update: (id, saved, earned) => ipcRenderer.invoke('goals:update', { id, saved, earned }),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  window: {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close:    () => ipcRenderer.send('window-close'),
  },
});
