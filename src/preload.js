const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chzzk', {
  getChannels: () => ipcRenderer.invoke('get-channels'),
  saveChannels: (channels) => ipcRenderer.invoke('save-channels', channels),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (partial) => ipcRenderer.invoke('set-settings', partial),
  setOpacity: (opacity) => ipcRenderer.invoke('set-opacity', opacity),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
  setUiScale: (scale) => ipcRenderer.invoke('set-ui-scale', scale),
  exportChannels: () => ipcRenderer.invoke('export-channels'),
  importChannels: () => ipcRenderer.invoke('import-channels'),
  fetchChannelInfo: (channelId) => ipcRenderer.invoke('fetch-channel-info', channelId),
  fetchAllChannels: (channelIds) => ipcRenderer.invoke('fetch-all-channels', channelIds),
  openChannel: (channelId) => ipcRenderer.invoke('open-channel', channelId),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  restartToUpdate: () => ipcRenderer.invoke('restart-to-update'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, data) => cb(data)),
});
