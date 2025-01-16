const { contextBridge, ipcRenderer } = require('electron');

// 브라우저(렌더러) 측에 노출할 API를 정의
contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (channel, data) => {
    ipcRenderer.send(channel, data);
  },
  onMessage: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  }
});
