/**
 * Electron main process for stage-web-react.
 *
 * The window is a desktop pet host: transparent, frameless, and always on top.
 * It shows the character alone on the `/pet` route. The settings, chat, and
 * widget pages open in their own windows.
 *
 * Run it with:
 *   pnpm -F @proj-aipets/stage-web-react dev      (Vite dev server)
 *   pnpm -F @proj-aipets/stage-web-react electron
 *
 * A right click on the pet opens the chat and settings entries. The tray and
 * the global shortcuts stay as the way back when the user hides the pet.
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

// The pet canvas is 720 x 1280, so these defaults keep its aspect ratio.
const WINDOW_DEFAULTS = { width: 360, height: 640 }
const MIN_WIDTH = 240
const MIN_HEIGHT = 320

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

/**
 * The pet windows, in instance order.
 *
 * The user can open several instances of one character. Each window keeps its
 * own hitbox, pointer mode, drag origin, and scale, so a drag or a resize of
 * one pet leaves the others alone. A window opened before the renderer reports
 * an instance id stays a placeholder.
 */
const petWindows = []

let tray = null
let clickThrough = false
/** Rebuilds the tray menu, so its labels follow the window state. */
let rebuildTrayMenu = null
/**
 * The instance ids of the last sync. A settings window mounts with the same
 * list, so this tells a new instance apart from one the user closed.
 */
let lastSyncedIds = new Set()
/** The user closed the last pet, so a plain sync must not reopen it. */
let petsDismissed = false

/** The live pet windows, oldest first. */
function livePets() {
  return petWindows.filter(entry => !entry.window.isDestroyed())
}

/** The window that the tray and the shortcuts act on. */
function primaryPetWindow() {
  return livePets()[0]?.window ?? null
}

/** The entry of the window that sent an IPC message. */
function petOfSender(webContents) {
  const window = BrowserWindow.fromWebContents(webContents)
  if (!window)
    return null

  return livePets().find(entry => entry.window === window) ?? null
}

/** The bounds key of one pet, so each instance restores its own place. */
function petStateKey(entry) {
  return entry.instanceId ?? 'default'
}

function readPetBounds(key) {
  const pets = windowStateStore.get().pets
  const state = pets && typeof pets === 'object' ? pets[key] : undefined

  return {
    width: Number.isFinite(state?.width) ? state.width : WINDOW_DEFAULTS.width,
    height: Number.isFinite(state?.height) ? state.height : WINDOW_DEFAULTS.height,
    x: Number.isFinite(state?.x) ? state.x : undefined,
    y: Number.isFinite(state?.y) ? state.y : undefined,
  }
}

function savePetBounds(entry) {
  if (entry.window.isDestroyed())
    return

  // A maximized window reports its restored bounds, so the state stays usable.
  const pets = windowStateStore.get().pets ?? {}
  windowStateStore.set({ pets: { ...pets, [petStateKey(entry)]: entry.window.getNormalBounds() } })
}

function saveAllPetBounds() {
  for (const entry of livePets())
    savePetBounds(entry)

  windowStateStore.flush()
}

/** Builds the app URL of one route for the dev server or the packaged build. */
function routeUrl(route) {
  const hash = route.startsWith('/') ? `#${route}` : `#/${route}`
  if (app.isPackaged)
    return `file://${path.join(__dirname, '..', 'dist', 'index.html').replace(/\\/g, '/')}${hash}`

  return new URL(hash, DEV_URL).toString()
}

/** Applies one pointer mode to one pet window. */
function setPointerIgnored(entry, value) {
  if (entry.window.isDestroyed() || entry.pointerIgnored === value)
    return

  entry.pointerIgnored = value
  entry.window.setIgnoreMouseEvents(value, { forward: true })
}

/**
 * Ignores the pointer outside the character, so the desktop keeps its clicks.
 * The manual toggle wins while it is on.
 */
function updatePointerPassthrough() {
  const cursor = screen.getCursorScreenPoint()

  for (const entry of livePets()) {
    if (!entry.window.isVisible())
      continue

    if (clickThrough || !entry.hitbox) {
      setPointerIgnored(entry, true)
      continue
    }

    const content = entry.window.getContentBounds()
    const x = cursor.x - content.x
    const y = cursor.y - content.y
    const inside = x >= entry.hitbox.x && x <= entry.hitbox.x + entry.hitbox.width
      && y >= entry.hitbox.y && y <= entry.hitbox.y + entry.hitbox.height

    setPointerIgnored(entry, !inside)
  }
}

// The desktop throw uses the same feel as the web stage: a release above the
// threshold keeps its speed, slows by friction, and bounces off the work area.
const DRAG_FLING_THRESHOLD = 380
const DRAG_FRICTION = 0.94
const DRAG_RESTITUTION = 0.55
const DRAG_STOP_SPEED = 20

function followPetDrag(entry) {
  if (!entry.dragOrigin || entry.window.isDestroyed()) {
    stopPetDrag(entry, { fling: false })
    return
  }

  const cursor = screen.getCursorScreenPoint()
  entry.dragSamples.push({ x: cursor.x, y: cursor.y, time: Date.now() })
  if (entry.dragSamples.length > 8)
    entry.dragSamples.shift()

  entry.window.setPosition(
    Math.round(entry.dragOrigin.window.x + cursor.x - entry.dragOrigin.cursor.x),
    Math.round(entry.dragOrigin.window.y + cursor.y - entry.dragOrigin.cursor.y),
  )
}

/** Cursor speed at the release, in CSS pixels per second. */
function dragReleaseVelocity(samples) {
  if (samples.length < 2)
    return { x: 0, y: 0 }

  const last = samples[samples.length - 1]
  // Only the last moments count, so a pause before the release does not throw.
  const first = samples.find(sample => last.time - sample.time <= 120) ?? samples[0]
  const seconds = (last.time - first.time) / 1000
  if (seconds <= 0)
    return { x: 0, y: 0 }

  return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds }
}

/**
 * Slides one pet window with the speed of the release.
 *
 * The window is the character, so moving the window is the desktop form of the
 * web stage throw. The window stops inside the work area and never returns to
 * where the drag started.
 */
function flingPetWindow(entry, velocity) {
  if (Math.hypot(velocity.x, velocity.y) < DRAG_FLING_THRESHOLD)
    return

  let vx = velocity.x
  let vy = velocity.y
  let previous = Date.now()

  entry.flingTimer = setInterval(() => {
    if (entry.window.isDestroyed()) {
      clearInterval(entry.flingTimer)
      entry.flingTimer = null
      return
    }

    const now = Date.now()
    const dt = Math.min(0.05, (now - previous) / 1000)
    previous = now

    const bounds = entry.window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    const minX = area.x
    const minY = area.y
    const maxX = area.x + area.width - bounds.width
    const maxY = area.y + area.height - bounds.height

    let x = bounds.x + vx * dt
    let y = bounds.y + vy * dt

    if (x <= minX) {
      x = minX
      vx = Math.abs(vx) * DRAG_RESTITUTION
    }
    else if (x >= maxX) {
      x = maxX
      vx = -Math.abs(vx) * DRAG_RESTITUTION
    }

    if (y <= minY) {
      y = minY
      vy = Math.abs(vy) * DRAG_RESTITUTION
    }
    else if (y >= maxY) {
      y = maxY
      vy = -Math.abs(vy) * DRAG_RESTITUTION
    }

    const decay = DRAG_FRICTION ** (dt * 60)
    vx *= decay
    vy *= decay

    entry.window.setPosition(Math.round(x), Math.round(y))

    if (Math.hypot(vx, vy) < DRAG_STOP_SPEED) {
      clearInterval(entry.flingTimer)
      entry.flingTimer = null
    }
  }, 16)
}

function startPetDrag(entry) {
  if (entry.window.isDestroyed())
    return

  // A new drag takes over from a window that is still sliding.
  stopPetDrag(entry, { fling: false })
  const cursor = screen.getCursorScreenPoint()
  const [x, y] = entry.window.getPosition()
  entry.dragOrigin = { cursor, window: { x, y } }
  entry.dragSamples = [{ x: cursor.x, y: cursor.y, time: Date.now() }]
  // The window follows the cursor, so the pointer stays over the same spot.
  entry.dragTimer = setInterval(followPetDrag, 16, entry)
}

function stopPetDrag(entry, { fling = true } = {}) {
  if (entry.dragTimer)
    clearInterval(entry.dragTimer)

  entry.dragTimer = null
  entry.dragOrigin = null

  if (entry.flingTimer) {
    clearInterval(entry.flingTimer)
    entry.flingTimer = null
  }

  const samples = entry.dragSamples
  entry.dragSamples = []

  if (fling)
    flingPetWindow(entry, dragReleaseVelocity(samples))
}

/**
 * Sizes one pet window to its character.
 *
 * The window is the character frame, so a larger character takes a larger
 * window instead of clipping inside a fixed one. The bottom edge stays put,
 * so the pet keeps standing where the user put it.
 */
function applyPetScale(entry, scale) {
  if (entry.window.isDestroyed() || !Number.isFinite(scale) || scale <= 0)
    return

  // The window stays inside the display, so the largest scale still fits.
  // The smallest scale stops at the window minimum size.
  const bounds = entry.window.getBounds()
  const area = screen.getDisplayMatching(bounds).workArea
  const fits = Math.min(area.width / WINDOW_DEFAULTS.width, area.height / WINDOW_DEFAULTS.height)
  const factor = Math.max(MIN_WIDTH / WINDOW_DEFAULTS.width, Math.min(4, scale, fits))
  if (Math.abs(factor - entry.scale) < 0.001)
    return

  entry.scale = factor
  const width = Math.round(WINDOW_DEFAULTS.width * factor)
  const height = Math.round(WINDOW_DEFAULTS.height * factor)
  const x = Math.round(bounds.x + (bounds.width - width) / 2)
  const y = Math.round(bounds.y + bounds.height - height)

  entry.window.setBounds({
    x: Math.min(Math.max(x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(y, area.y), area.y + area.height - height),
    width,
    height,
  })
}

function applyClickThrough(value) {
  clickThrough = Boolean(value)
  // A click-through window cannot receive pointer events, so the tray and the
  // global shortcut are the way back.
  updatePointerPassthrough()

  for (const entry of livePets())
    entry.window.webContents.send(CHANNELS.visibilityChanged, { clickThrough })

  rebuildTrayMenu?.()
  return clickThrough
}

/** The start bounds of a new pet. Each new pet steps away from the first one. */
function petWindowBounds(entry, cascade) {
  const saved = readPetBounds(petStateKey(entry))
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y))
    return saved

  const area = screen.getPrimaryDisplay().workArea
  const anchor = primaryPetWindow()?.getBounds()
  const baseX = anchor?.x ?? Math.round(area.x + (area.width - saved.width) / 2)
  const baseY = anchor?.y ?? Math.round(area.y + (area.height - saved.height) / 2)
  const step = 32 * cascade

  return {
    ...saved,
    x: Math.min(Math.max(baseX + step, area.x), area.x + area.width - saved.width),
    y: Math.min(Math.max(baseY + step, area.y), area.y + area.height - saved.height),
  }
}

/**
 * Opens one pet window. The route carries the instance id, so the renderer
 * shows the character and the look of that instance.
 */
function createPetWindow({ instanceId = null, cascade = 0, withDevTools = false } = {}) {
  const entry = {
    window: null,
    instanceId,
    hitbox: null,
    pointerIgnored: false,
    dragOrigin: null,
    dragTimer: null,
    dragSamples: [],
    flingTimer: null,
    scale: 0,
  }
  const bounds = petWindowBounds(entry, cascade)

  entry.window = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
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

  petWindows.push(entry)

  // The pet floats over other windows, including fullscreen ones.
  entry.window.setAlwaysOnTop(true, 'screen-saver')
  entry.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // The pet route renders the character without the page chrome. The web app
  // keeps the full stage at `/`.
  void entry.window.loadURL(routeUrl(petRoute(instanceId)))

  entry.window.on('move', () => savePetBounds(entry))
  entry.window.on('resize', () => savePetBounds(entry))
  entry.window.on('closed', () => {
    stopPetDrag(entry, { fling: false })
    const index = petWindows.indexOf(entry)
    if (index >= 0)
      petWindows.splice(index, 1)
  })

  // The pet stays resident in the tray. Only Quit closes the window.
  entry.window.on('close', (event) => {
    if (isQuitting || !preferences.closeToTray)
      return

    event.preventDefault()
    entry.window.hide()
    tray?.setToolTip('aipets (hidden)')
  })

  // A pet window must never navigate away from the app. Links open outside.
  entry.window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (withDevTools && !app.isPackaged)
    entry.window.webContents.openDevTools({ mode: 'detach' })

  registerPetContextMenu(entry)
  return entry
}

function petRoute(instanceId) {
  return instanceId ? `/pet?instance=${encodeURIComponent(instanceId)}` : '/pet'
}

/** Removes one pet window and its entry. */
function closePetWindow(entry) {
  stopPetDrag(entry, { fling: false })
  if (!entry.window.isDestroyed())
    entry.window.destroy()

  const index = petWindows.indexOf(entry)
  if (index >= 0)
    petWindows.splice(index, 1)
}

/**
 * Opens one window per instance and closes the windows of removed instances.
 *
 * The startup window has no instance id yet. The first requested instance
 * takes it over, so the app never opens an extra window.
 */
function syncPetWindows(targets) {
  const wanted = new Set()
  for (const target of targets) {
    if (target && typeof target.id === 'string' && target.id)
      wanted.add(target.id)
  }

  const fresh = [...wanted].some(id => !lastSyncedIds.has(id))
  lastSyncedIds = wanted

  // A settings window reports the same list, so a closed pet must stay closed
  // until the user adds one or asks for it from the tray.
  if (petsDismissed && !fresh)
    return []

  petsDismissed = false

  for (const entry of livePets()) {
    if (entry.instanceId && !wanted.has(entry.instanceId))
      closePetWindow(entry)
  }

  const assigned = new Set(livePets().map(entry => entry.instanceId).filter(Boolean))

  for (const id of wanted) {
    if (assigned.has(id))
      continue

    const placeholder = livePets().find(entry => !entry.instanceId)
    if (placeholder) {
      placeholder.instanceId = id
      void placeholder.window.loadURL(routeUrl(petRoute(id)))
      assigned.add(id)
      continue
    }

    createPetWindow({ instanceId: id, cascade: petWindows.length })
    assigned.add(id)
  }

  return livePets().map(entry => entry.instanceId).filter(Boolean)
}

/** Shows or hides every pet with one toggle. */
function toggleWindow() {
  const live = livePets()
  if (!live.length) {
    // The user closed every pet. The tray brings them back.
    petsDismissed = false
    syncPetWindows([...lastSyncedIds].map(id => ({ id })))
    return
  }

  const visible = live.some(entry => entry.window.isVisible())
  for (const entry of live) {
    if (visible)
      entry.window.hide()
    else
      entry.window.show()
  }

  tray?.setToolTip(visible ? 'aipets (hidden)' : 'aipets')
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

/**
 * The pet window has no chrome, so the right click is its only menu. It lists
 * the two windows a user needs while the pet sits on the desktop.
 */
function registerPetContextMenu(entry) {
  const { window } = entry
  if (window.isDestroyed())
    return

  window.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Chat', click: () => secondaryWindows?.open('chat') },
      { label: 'Settings', click: () => openSettingsWindow() },
      { type: 'separator' },
      // A pet window hides on close, so this entry must remove it. The last
      // one also stays closed until the user asks for a pet again.
      {
        label: 'Close this pet',
        click: () => {
          closePetWindow(entry)
          if (livePets().length === 0)
            petsDismissed = true
        },
      },
    ])
    menu.popup({ window })
  })
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
        checked: primaryPetWindow()?.isAlwaysOnTop() ?? true,
        click: (item) => {
          for (const entry of livePets())
            entry.window.setAlwaysOnTop(item.checked, 'screen-saver')
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
      {
        label: 'Reload',
        click: () => {
          for (const entry of livePets())
            entry.window.reload()
        },
      },
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
  visible: livePets().some(entry => entry.window.isVisible()),
}))

ipcMain.handle(CHANNELS.setClickThrough, (_event, value) => applyClickThrough(value))

ipcMain.on(CHANNELS.petHitbox, (event, rect) => {
  const entry = petOfSender(event.sender)
  const values = [rect?.x, rect?.y, rect?.width, rect?.height]
  if (!entry || !values.every(value => Number.isFinite(value)))
    return

  entry.hitbox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  updatePointerPassthrough()
})

ipcMain.on(CHANNELS.petDrag, (event, phase) => {
  const entry = petOfSender(event.sender)
  if (!entry)
    return

  if (phase === 'start')
    startPetDrag(entry)
  else
    stopPetDrag(entry)
})

ipcMain.on(CHANNELS.petScale, (event, scale) => {
  const entry = petOfSender(event.sender)
  if (entry)
    applyPetScale(entry, Number(scale))
})

// The renderer owns the instance list, so it reports the set of pets to show.
ipcMain.handle(CHANNELS.petSync, (_event, targets) => syncPetWindows(Array.isArray(targets) ? targets : []))

ipcMain.handle(CHANNELS.setVisible, (_event, value) => {
  // A closed pet comes back with the same toggle that hides one.
  if (value && livePets().length === 0)
    toggleWindow()

  const pets = livePets()
  if (pets.length === 0)
    return false

  for (const entry of pets) {
    if (value)
      entry.window.show()
    else
      entry.window.hide()
  }

  return pets.some(entry => entry.window.isVisible())
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

// The chat window forwards its animation signals here. Every pet window
// replays them on its own director bus. The director context travels the other
// way, from the pet window to the chat window.
ipcMain.on(CHANNELS.petEvent, (_event, message) => {
  const kind = message && typeof message === 'object' ? message.kind : ''

  if (kind === 'context') {
    const pets = livePets()

    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed() || pets.some(entry => entry.window === window))
        continue

      window.webContents.send(CHANNELS.petEvent, message)
    }

    return
  }

  for (const entry of livePets())
    entry.window.webContents.send(CHANNELS.petEvent, message)
})

ipcMain.handle(CHANNELS.pluginsList, () => pluginHost?.list() ?? [])

ipcMain.handle(CHANNELS.pluginsInstall, async () => {
  const options = { title: 'Select a plugin folder', properties: ['openDirectory'] }
  const owner = primaryPetWindow()
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
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
    const pets = livePets()
    if (pets.length === 0)
      return

    for (const entry of pets)
      entry.window.show()
    primaryPetWindow()?.focus()
  })

  app.whenReady().then(async () => {
    preferences = preferencesStore.get()

    pluginHost = new PluginHost({
      rootDir: path.join(app.getPath('userData'), 'plugins'),
      stateFile: path.join(app.getPath('userData'), 'plugins-state.json'),
    })

    registerPermissionHandlers()

    // The first window is a placeholder. The renderer reports its instances
    // with CHANNELS.petSync, and the main process reuses this window for the
    // first one.
    createPetWindow({ withDevTools: !app.isPackaged })

    // The pet window follows the pointer, so clicks outside the character
    // reach the desktop. 60 ms keeps the switch invisible to the user.
    setInterval(updatePointerPassthrough, 60)

    secondaryWindows = new SecondaryWindows({
      preloadPath: path.join(__dirname, 'preload.cjs'),
      iconPath: iconPath(),
      routeUrl,
      store: windowStateStore,
      mainWindow: () => primaryPetWindow(),
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
        createPetWindow({ withDevTools: !app.isPackaged })
    })
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    secondaryWindows?.closeAll()
    pluginHost?.dispose()
    saveAllPetBounds()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
