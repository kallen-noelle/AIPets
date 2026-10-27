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

const fs = require('node:fs')
const path = require('node:path')
const process = require('node:process')

const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } = require('electron')

const DEV_URL = process.env.STAGE_WEB_REACT_URL ?? 'http://localhost:5173/#/'

const WINDOW_DEFAULTS = { width: 480, height: 720, x: undefined, y: undefined }
const MIN_WIDTH = 320
const MIN_HEIGHT = 480

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json')
const iconPath = () => path.join(__dirname, '..', 'resources', 'icon.png')

let mainWindow = null
let tray = null
let clickThrough = false
let saveTimer = null
/** Rebuilds the tray menu, so its labels follow the window state. */
let rebuildTrayMenu = null

function readWindowState() {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8')
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null)
      return { ...WINDOW_DEFAULTS }
    return {
      width: Number.isFinite(parsed.width) ? parsed.width : WINDOW_DEFAULTS.width,
      height: Number.isFinite(parsed.height) ? parsed.height : WINDOW_DEFAULTS.height,
      x: Number.isFinite(parsed.x) ? parsed.x : undefined,
      y: Number.isFinite(parsed.y) ? parsed.y : undefined,
    }
  }
  catch {
    return { ...WINDOW_DEFAULTS }
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  // A maximized window reports its restored bounds, so the state stays usable.
  const bounds = mainWindow.getNormalBounds()
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(bounds))
  }
  catch {
    // A read-only profile folder must not break the window.
  }
}

function scheduleSave() {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(saveWindowState, 400)
}

function applyClickThrough(value) {
  if (!mainWindow || mainWindow.isDestroyed())
    return clickThrough

  clickThrough = Boolean(value)
  // A click-through window cannot receive pointer events, so the tray and the
  // global shortcut are the way back.
  mainWindow.setIgnoreMouseEvents(clickThrough, { forward: true })
  mainWindow.webContents.send('desktop:visibility-changed', { clickThrough })
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
    title: 'aipetdex',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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
    tray?.setToolTip('aipetdex (hidden)')
  }
  else {
    mainWindow.show()
    mainWindow.focus()
    tray?.setToolTip('aipetdex')
  }
}

function openSettings() {
  if (!mainWindow || mainWindow.isDestroyed())
    return

  const target = app.isPackaged
    ? `file://${path.join(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/')}#/settings`
    : new URL('#/settings', DEV_URL).toString()

  void mainWindow.loadURL(target)
  mainWindow.show()
  mainWindow.focus()
}

function createTray() {
  const icon = nativeImage.createFromPath(iconPath())
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 18, height: 18 }))
  tray.setToolTip('aipetdex')

  const rebuild = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Show or hide', click: toggleWindow },
      {
        label: clickThrough ? 'Stop click-through' : 'Start click-through',
        click: () => applyClickThrough(!clickThrough),
      },
      { label: 'Settings', click: openSettings },
      {
        label: 'Always on top',
        type: 'checkbox',
        checked: mainWindow?.isAlwaysOnTop() ?? true,
        click: (item) => {
          mainWindow?.setAlwaysOnTop(item.checked, 'screen-saver')
          rebuildTrayMenu?.()
        },
      },
      { type: 'separator' },
      { label: 'Reload', click: () => mainWindow?.reload() },
      { label: 'Quit', click: () => app.quit() },
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

ipcMain.handle('desktop:get-info', () => ({
  platform: process.platform,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  clickThrough,
  visible: mainWindow?.isVisible() ?? false,
}))

ipcMain.handle('desktop:set-click-through', (_event, value) => applyClickThrough(value))

ipcMain.handle('desktop:set-visible', (_event, value) => {
  if (!mainWindow || mainWindow.isDestroyed())
    return false

  if (value)
    mainWindow.show()
  else
    mainWindow.hide()
  return mainWindow.isVisible()
})

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

  app.whenReady().then(() => {
    createWindow()
    createTray()
    registerShortcuts()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0)
        createWindow()
    })
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    saveWindowState()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
      app.quit()
  })
}
