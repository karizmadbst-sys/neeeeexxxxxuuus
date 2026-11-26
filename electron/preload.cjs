const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusDesktop', Object.freeze({
  isElectron: true,
  platform: process.platform,
  toggleFullscreen: () => ipcRenderer.invoke('nexus:toggleFullscreen'),
  setFullscreen: (fullscreen) => ipcRenderer.invoke('nexus:setFullscreen', Boolean(fullscreen)),
  isFullscreen: () => ipcRenderer.invoke('nexus:isFullscreen'),
}));
