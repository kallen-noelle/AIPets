/**
 * Electron main process for stage-web-react.
 *
 * The window is a desktop pet host: transparent, frameless, and always on top.
 * It loads the Vite dev server in development and the built `dist/index.html`
 * in production.
 *
 * Run it with:
 *   pnpm -F @proj-airi/stage-web-react dev      (Vite dev server)
 *   pnpm -F @proj-airi/stage-web-react electron
 *
 * The settings and chat pages paint their own background, so a transparent
 * window only shows the page beneath the character on the stage route.
 */

const path = require('node:path')
const process = require('node:process')

const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  session,
  shell,
  Tray,
} = require('electron')

const { PluginHost, registerPluginScheme } = require('./plugins/host.cjs')
const { CHANNELS, PREFERENCES_DEFAULTS } = require('./shared/contract.cjs')
const { JsonStore } = require('./shared/store.cjs')
const { SecondaryWindows } = require('./windows.cjs')

const DEV_URL = process.env.STAGE_WEB_REACT_URL ?? 'http://localhost:5173/#/'
const DEV_ORIGIN = new URL(DEV_URL).origin

const WINDOW_DEFAULTS = { width: 480, height: 720 }
const MIN_WIDTH = 320
const MIN_HEIGHT = 480

// The asset scheme must register before the app is ready.
registerPluginScheme()

// Both stores hold main-process state. The renderer never writes these files.
const preferencesStore = new JsonStore(
  path.join(app.getPath('userData'), 'desktop-preferences.json'),
  PREFERENCES_DEFAULTS,
)
const windowStateStore = new JsonStore(
  path.join(app.getPath('userData'), 'window-state.json'),
  WINDOW_DEFAULTS,
)

let preferences = preferencesStore.get()
let pluginHost = null
let secondaryWindows = null
/** Set when the user quits, so the close handler lets the window close. */
let isQuitting = false

const iconPath = () => path.join(__dirname, '..', 'resources', 'icon.png')

let mainWindow = null
let tray = null
let clickThrough = false
/** Rebuilds the tray menu, so its labels follow the window state. */
let rebuildTrayMenu = null

function readWindowState() {
  const state = windowStateStore.get()

  return {
    width: Number.isFinite(state.width) ? state.width : WINDOW_DEFAULTS.width,
    height: Number.isFinite(state.height) ? state.height : WINDOW_DEFAULTS.height,
    x: Number.isFinite(state.x) ? state.x : undefined,
    y: Number.isFinite(state.y) ? state.y : undefined,
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  // A maximized window reports its restored bounds, so the state stays usable.
  windowStateStore.set(mainWindow.getNormalBounds())
  windowStateStore.flush()
}

function scheduleSave() {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  windowStateStore.set(mainWindow.getNormalBounds())
}

/** Builds the app URL of one route for the dev server or the packaged build. */
function routeUrl(route) {
  const hash = route.startsWith('/') ? `#${route}` : `#/${route}`
  if (app.isPackaged)
    return `file://${path.join(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/')}${hash}`

  return new URL(hash, DEV_URL).toString()
}

function applyClickThrough(value) {
  if (!mainWindow || mainWindow.isDestroyed())
    return clickThrough

  clickThrough = Boolean(value)
  // A click-through window cannot receive pointer events, so the tray and the
  // global shortcut are the way back.
  mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true })
  mainWindow.webContents.send(CHANNELS.visibilityChanged, { clickThrough })
  rebuildTrayMenu?.()
  return clickThrough
}

function createWindow() {
  const state = readWindowState()

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    transparent: true,
    frame: false,
    resizable: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    skipTaskbar: false,
    title: 'aipets',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // The preload requires the shared contract module. Sandboxed preloads
      // cannot load local files, so keep the sandbox off and isolation on.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // The pet floats over other windows, including fullscreen ones.
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (app.isPackaged)
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { hash: '/' })
  else
    void mainWindow.loadURL(DEV_URL)

  mainWindow.on('move', scheduleSave)
  mainWindow.on('resize', scheduleSave)

  // The pet stays resident in the tray. Only Quit closes the window.
  mainWindow.on('close', (event) => {
    if (isQuitting || !preferences.closeToTray)
      return

    event.preventDefault()
    mainWindow.hide()
    tray?.setToolTip('aipets (hidden)')
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // A pet window must never navigate away from the app. Links open outside.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged)
    mainWindow.webContents.openDevTools({ mode: 'detach' })

  return mainWindow
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    tray?.setToolTip('aipets (hidden)')
  }
  else {
    mainWindow.show()
    mainWindow.focus()
    tray?.setToolTip('aipets')
  }
}

function openSettingsWindow(route = '/settings') {
  secondaryWindows?.open('settings', route)
}

function toggleWidgetWindow() {
  if (secondaryWindows?.resolve('widget'))
    secondaryWindows.close('widget')
  else
    secondaryWindows?.open('widget')
}

function createTray() {
  const icon = nativeImage.createFromPath(iconPath())
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 18, height: 18 }))
  tray.setToolTip('aipets')

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Show or hide', click: toggleWindow },
      {
        label: clickThrough ? 'Stop click-through' : 'Start click-through',
        click: () => applyClickThrough(!clickThrough),
      },
      { label: 'Settings', click: () => openSettingsWindow() },
      { label: 'Widget window', click: toggleWidgetWindow },
      {
        label: 'Always on top',
        type: 'checkbox',
        checked: mainWindow?.isAlwaysOnTop() ?? true,
        click: (item) => {
          mainWindow?.setAlwaysOnTop(item.checked, 'screen-saver')
          rebuildTrayMenu?.()
        },
      },
      {
        label: 'Close to tray',
        type: 'checkbox',
        checked: preferences.closeToTray,
        click: (item) => {
          preferences = preferencesStore.set({ closeToTray: item.checked })
          preferencesStore.flush()
          broadcast(CHANNELS.preferencesChanged, preferences)
          rebuildTrayMenu?.()
        },
      },
      { type: 'separator' },
      { label: 'Reload', click: () => mainWindow?.reload() },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ])
    tray.setContextMenu(menu)
  }

  rebuildTrayMenu = rebuild
  rebuild()
  tray.on('click', toggleWindow)
}

function registerShortcuts() {
  // Ctrl+Shift+P shows or hides the pet. Ctrl+Shift+L toggles click-through,
  // which is the only way back when the window ignores the pointer.
  globalShortcut.register('CommandOrControl+Shift+P', toggleWindow)
  globalShortcut.register('CommandOrControl+Shift+L', () => applyClickThrough(!clickThrough))
}

function broadcast(channel, payload) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed())
      window.webContents.send(channel, payload)
  }
}

function registerPowerEvents() {
  const types = [
    'suspend',
    'resume',
    'lock-screen',
    'unlock-screen',
    'on-ac',
    'on-battery',
    'shutdown',
    'user-did-become-active',
    'user-did-resign-active',
  ]

  for (const type of types)
    powerMonitor.on(type, () => broadcast(CHANNELS.powerEvent, { type, at: Date.now() }))
}

function listDisplays() {
  const primaryId = screen.getPrimaryDisplay().id

  return screen.getAllDisplays().map((display, index) => ({
    id: display.id,
    label: `Display ${index + 1}`,
    primary: display.id === primaryId,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
  }))
}

function registerDisplayEvents() {
  const handle = () => {
    // A window can sit on the monitor that just went away. Pull it back.
    secondaryWindows?.reflow()
    broadcast(CHANNELS.displaysChanged, listDisplays())
  }

  screen.on('display-added', handle)
  screen.on('display-removed', handle)
  screen.on('display-metrics-changed', handle)
}

function registerDisplayMediaHandler() {
  // The renderer calls getDisplayMedia without a picker dialog. This handler
  // picks the primary screen and adds the Windows loopback audio track.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => {
        const primaryId = String(screen.getPrimaryDisplay().id)
        const source = sources.find(item => String(item.display_id) === primaryId) ?? sources[0]

        if (!source) {
          callback({})
          return
        }

        if (request.audioRequested && process.platform === 'win32')
          callback({ video: source, audio: 'loopback' })
        else
          callback({ video: source })
      })
      .catch(() => callback({}))
  }, { useSystemPicker: false })
}

/**
 * Grants only the media permissions that the stage uses.
 *
 * The renderer asks for the microphone, screen capture, and audio output
 * selection. Every other permission, and every other origin, is refused.
 */
function registerPermissionHandlers() {
  const isAppOrigin = (origin) => {
    if (!origin)
      return false
    if (origin.startsWith('file://'))
      return true

    try {
      return new URL(origin).origin === DEV_ORIGIN
    }
    catch {
      return false
    }
  }

  const allowsAudio = details => !details?.mediaTypes || details.mediaTypes.includes('audio')

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (!webContents || !isAppOrigin(webContents.getURL())) {
      callback(false)
      return
    }

    if (permission === 'media')
      callback(allowsAudio(details))
    else if (permission === 'display-capture' || permission === 'speaker-selection')
      callback(true)
    else
      callback(false)
  })

  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    const origin = requestingOrigin || webContents?.getURL() || ''
    if (!isAppOrigin(origin))
      return false

    if (permission === 'media')
      return allowsAudio(details)
    return permission === 'display-capture' || permission === 'speaker-selection'
  })
}

ipcMain.handle(CHANNELS.getInfo, () => ({
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  clickThrough,
  visible: mainWindow?.isVisible() ?? false,
}))

ipcMain.handle(CHANNELS.setClickThrough, (_event, value) => applyClickThrough(value))

ipcMain.handle(CHANNELS.setVisible, (_event, value) => {
  if (!mainWindow || mainWindow.isDestroyed())
    return false

  if (value)
    mainWindow.show()
  else
    mainWindow.hide()
  return mainWindow.isVisible()
})

ipcMain.handle(CHANNELS.getPreferences, () => ({ ...preferences }))

ipcMain.handle(CHANNELS.setPreferences, (_event, patch) => {
  if (patch && typeof patch.closeToTray === 'boolean')
    preferences = preferencesStore.set({ closeToTray: patch.closeToTray })

  preferencesStore.flush()
  rebuildTrayMenu?.()
  broadcast(CHANNELS.preferencesChanged, preferences)
  return { ...preferences }
})

ipcMain.handle(CHANNELS.getPowerState, () => ({
  platform: process.platform,
  onBatteryPower: powerMonitor.isOnBatteryPower(),
  idleState: powerMonitor.getSystemIdleState(60),
  idleSeconds: powerMonitor.getSystemIdleTime(),
}))

ipcMain.handle(CHANNELS.listDisplays, () => listDisplays())

ipcMain.handle(CHANNELS.windowList, () => secondaryWindows?.list() ?? [])

ipcMain.handle(CHANNELS.windowOpen, (_event, kind, route) => {
  secondaryWindows?.open(String(kind), typeof route === 'string' ? route : undefined)
  return secondaryWindows?.list() ?? []
})

ipcMain.handle(CHANNELS.windowClose, (_event, kind) => {
  secondaryWindows?.close(String(kind))
  return secondaryWindows?.list() ?? []
})

ipcMain.handle(CHANNELS.windowFocus, (_event, kind) => secondaryWindows?.focus(String(kind)) ?? false)

ipcMain.handle(CHANNELS.windowToggleFullscreen, (_event, kind) => secondaryWindows?.toggleFullscreen(String(kind)) ?? false)

ipcMain.handle(CHANNELS.windowAlwaysOnTop, (_event, kind, value) => secondaryWindows?.setAlwaysOnTop(String(kind), Boolean(value)) ?? false)

ipcMain.handle(CHANNELS.pluginsList, () => pluginHost?.list() ?? [])

ipcMain.handle(CHANNELS.pluginsInstall, async () => {
  const options = { title: 'Select a plugin folder', properties: ['openDirectory'] }
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || !result.filePaths[0] || !pluginHost)
    return pluginHost?.list() ?? []

  return pluginHost.install(result.filePaths[0])
})

ipcMain.handle(CHANNELS.pluginsSetEnabled, (_event, id, enabled) => pluginHost?.setEnabled(String(id), Boolean(enabled)) ?? [])

ipcMain.handle(CHANNELS.pluginsRemove, (_event, id) => pluginHost?.remove(String(id)) ?? [])

ipcMain.handle(CHANNELS.pluginsOpen, (_event, id, moduleId) => pluginHost?.openBinding(String(id), String(moduleId)) ?? false)

ipcMain.handle(CHANNELS.pluginsClose, (_event, id, moduleId) => pluginHost?.closeBinding(String(id), String(moduleId)) ?? false)

const singleInstance = app.requestSingleInstanceLock()

if (!singleInstance) {
  app.quit()
}
else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed())
      return
    mainWindow.show()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    preferences = preferencesStore.get()

    pluginHost = new PluginHost({
      rootDir: path.join(app.getPath('userData'), 'plugins'),
      stateFile: path.join(app.getPath('userData'), 'plugins-state.json'),
    })

    registerPermissionHandlers()

    createWindow()

    secondaryWindows = new SecondaryWindows({
      preloadPath: path.join(__dirname, 'preload.cjs'),
      iconPath: iconPath(),
      routeUrl,
      store: windowStateStore,
      mainWindow: () => mainWindow,
      onChange: list => broadcast(CHANNELS.windowsChanged, list),
    })

    createTray()
    registerShortcuts()
    registerPowerEvents()
    registerDisplayEvents()
    registerDisplayMediaHandler()

    try {
      await pluginHost.initialize()
    }
    catch {
      // A broken plugin must not stop the pet window.
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0)
        createWindow()
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    secondaryWindows?.closeAll()
    pluginHost?.dispose()
    saveWindowState()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
