// Exposes a small, explicit API to the renderer. Nothing else crosses the bridge.
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('writer', {
  platform: process.platform,
  getSettings: invoke('settings:get'),
  setSettings: invoke('settings:set'),
  chooseFolder: invoke('folder:choose'),
  listFiles: invoke('folder:list'),
  readFile: invoke('file:read'),
  writeFile: invoke('file:write'),
  createFile: invoke('file:create'),
  renameFile: invoke('file:rename'),
  trashFile: invoke('file:trash'),
  revealFile: invoke('file:reveal'),
  assetDataUrl: invoke('asset:dataUrl'),
  importAsset: invoke('asset:import'),
  saveDrawing: invoke('drawing:save'),
  loadDrawing: invoke('drawing:load'),
  exportBlog: invoke('export:blog'),
  learnWord: invoke('spell:learn'),
  closeReady: invoke('app:closeReady'),
  onMenu: (fn) => {
    const listener = (_e, command, arg) => fn(command, arg);
    ipcRenderer.on('menu', listener);
    return () => ipcRenderer.removeListener('menu', listener);
  },
  onSettings: (fn) => {
    const listener = (_e, s) => fn(s);
    ipcRenderer.on('settings', listener);
    return () => ipcRenderer.removeListener('settings', listener);
  },
});
