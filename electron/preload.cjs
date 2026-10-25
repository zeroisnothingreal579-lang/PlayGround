const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stackview', {
  isElectron: true,
  guestPreload: process.env.STACKVIEW_GUEST_PRELOAD || '',
  startUrl: process.env.STACKVIEW_START_URL || '',
  proxyTemplate: process.env.STACKVIEW_PROXY_TEMPLATE || '',
  proxyList: String(process.env.STACKVIEW_PROXY_LIST || '')
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean),
  allowedHosts: String(process.env.STACKVIEW_ALLOWED_HOSTS || '')
    .split(',')
    .map(host => host.trim())
    .filter(Boolean),
  setProxy: payload => ipcRenderer.invoke('sv:proxy:set', payload),
  clearProxy: partition => ipcRenderer.invoke('sv:proxy:clear', partition),
  verifyProxy: partition => ipcRenderer.invoke('sv:proxy:verify', partition),
  openStandalone: payload => ipcRenderer.invoke('sv:open-standalone', payload),
  onBlocked: callback => {
    const listener = (_event, url) => callback(url)
    ipcRenderer.on('sv:blocked', listener)
    return () => ipcRenderer.removeListener('sv:blocked', listener)
  }
})
