const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('polymind', {
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (payload) => ipcRenderer.invoke('config:set', payload),
  },
  trades: {
    getCached: () => ipcRenderer.invoke('trades:getCached'),
    sync: () => ipcRenderer.invoke('trades:sync'),
    create: (trade) => ipcRenderer.invoke('trades:create', trade),
    update: (trade) => ipcRenderer.invoke('trades:update', trade),
    delete: (id) => ipcRenderer.invoke('trades:delete', id),
  },
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
});
