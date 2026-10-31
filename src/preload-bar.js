'use strict';

// The window her text is typed into (Linux). Nothing else: what's typed goes back to the overlay,
// which owns the conversation and the prompt it belongs to. Its mic sends a WAV to main, which asks
// Fono to transcribe it; the bar only records.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bar', {
  onLabels: (fn) => ipcRenderer.on('bar:labels', (_e, payload) => fn(payload)),
  submit: (text) => ipcRenderer.send('bar:submit', String(text || '')),
  escape: () => ipcRenderer.send('bar:escape'),
  stt: (audio) => ipcRenderer.invoke('fono:stt', audio),
  sttStop: () => ipcRenderer.send('fono:sttStop'),
  notify: (payload) => ipcRenderer.send('bar:voice', payload || {}),
  onCancel: (fn) => ipcRenderer.on('bar:cancel', () => fn()),
});
