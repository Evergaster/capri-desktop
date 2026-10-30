'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('probe', {
  onCursor: (fn) => ipcRenderer.on('probe:cursor', (_e, p) => fn(p)),
  onInfo: (fn) => ipcRenderer.on('probe:info', (_e, p) => fn(p)),
  event: (kind, data) => ipcRenderer.send('probe:event', { kind, data }),
});
