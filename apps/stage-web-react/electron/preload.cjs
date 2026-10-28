/**
 * Preload script of the stage-web-react desktop host.
 *
 * It exposes a small, typed bridge on `window.aipetdexDesktop`. The renderer
 * never receives Node or Electron objects. The channel names come from the
 * shared contract, so the main process and this file cannot drift apart.
 */

const nodeProcess = require('node:process')

const { contextBridge, ipcRenderer } = require('electron')

const { CHANNELS } = require('./shared/contract.cjs')

function subscribe(channel, listener) {
  const handler = (_event, payload) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('aipetdexDesktop', {
  platform: nodeProcess.platform,
  versions: {
    electron: nodeProcess.versions.electron,
    chrome: nodeProcess.versions.chrome,
  },
  getInfo: () => ipcRenderer.invoke(CHANNELS.getInfo),
  setClickThrough: value => ipcRenderer.invoke(CHANNELS.setClickThrough, Boolean(value)),
  setVisible: value => ipcRenderer.invoke(CHANNELS.setVisible, Boolean(value)),
  onVisibilityChanged: listener => subscribe(CHANNELS.visibilityChanged, listener),

  getPreferences: () => ipcRenderer.invoke(CHANNELS.getPreferences),
  setPreferences: patch => ipcRenderer.invoke(CHANNELS.setPreferences, patch),
  onPreferencesChanged: listener => subscribe(CHANNELS.preferencesChanged, listener),

  getPowerState: () => ipcRenderer.invoke(CHANNELS.getPowerState),
  onPowerEvent: listener => subscribe(CHANNELS.powerEvent, listener),
  listDisplays: () => ipcRenderer.invoke(CHANNELS.listDisplays),
  onDisplaysChanged: listener => subscribe(CHANNELS.displaysChanged, listener),

  listWindows: () => ipcRenderer.invoke(CHANNELS.windowList),
  openWindow: (kind, route) => ipcRenderer.invoke(CHANNELS.windowOpen, kind, route),
  closeWindow: kind => ipcRenderer.invoke(CHANNELS.windowClose, kind),
  focusWindow: kind => ipcRenderer.invoke(CHANNELS.windowFocus, kind),
  toggleWindowFullscreen: kind => ipcRenderer.invoke(CHANNELS.windowToggleFullscreen, kind),
  setWindowAlwaysOnTop: (kind, value) => ipcRenderer.invoke(CHANNELS.windowAlwaysOnTop, kind, Boolean(value)),
  onWindowsChanged: listener => subscribe(CHANNELS.windowsChanged, listener),

  listPlugins: () => ipcRenderer.invoke(CHANNELS.pluginsList),
  installPlugin: () => ipcRenderer.invoke(CHANNELS.pluginsInstall),
  setPluginEnabled: (id, enabled) => ipcRenderer.invoke(CHANNELS.pluginsSetEnabled, id, Boolean(enabled)),
  removePlugin: id => ipcRenderer.invoke(CHANNELS.pluginsRemove, id),
  openPluginBinding: (id, moduleId) => ipcRenderer.invoke(CHANNELS.pluginsOpen, id, moduleId),
  closePluginBinding: (id, moduleId) => ipcRenderer.invoke(CHANNELS.pluginsClose, id, moduleId),
})
