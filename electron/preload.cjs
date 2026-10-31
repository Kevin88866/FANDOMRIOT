// 给页面暴露有限的本地能力：存档读写、退出、全屏切换、错误日志、版本号
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  readSave: slot => ipcRenderer.sendSync('save:read', String(slot)),
  writeSave: (slot, data) => ipcRenderer.sendSync('save:write', String(slot), String(data)),
  deleteSave: slot => ipcRenderer.sendSync('save:delete', String(slot)),
  quit: () => ipcRenderer.send('app:quit'),
  setDisplay: mode => ipcRenderer.send('app:display', mode === 'windowed' ? 'windowed' : 'fullscreen'),
  log: msg => ipcRenderer.send('app:log', String(msg).slice(0, 4000)),
  version: ipcRenderer.sendSync('app:version'),
  screen: () => ipcRenderer.sendSync('app:screen'),
  setWindowSize: (w, h) => ipcRenderer.send('app:winsize', w, h),
  setFpsUnlimited: on => ipcRenderer.send('app:fps', !!on),
});
