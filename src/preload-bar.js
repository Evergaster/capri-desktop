'use strict';

// The window her text is typed into (Linux). Nothing else: what's typed goes back to the overlay,
// which owns the conversation and the prompt it belongs to.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bar', {
  onLabels: (fn) => ipcRenderer.on('bar:labels', (_e, payload) => fn(payload)),
  submit: (text) => ipcRenderer.send('bar:submit', String(text || '')),
  escape: () => ipcRenderer.send('bar:escape'),
});
