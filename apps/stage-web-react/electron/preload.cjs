/**
 * Preload script of the stage-web-react desktop host.
 *
 * It exposes a small, typed bridge on `window.aipetdexDesktop`. The renderer
 * never receives Node or Electron objects.
 */

const process = require('node:process')

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('aipetdexDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  setClickThrough: value => ipcRenderer.invoke('desktop:set-click-through', Boolean(value)),
  setVisible: value => ipcRenderer.invoke('desktop:set-visible', Boolean(value)),
  onVisibilityChanged: (listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on('desktop:visibility-changed', handler)
    return () => ipcRenderer.removeListener('desktop:visibility-changed', handler)
  },
})
