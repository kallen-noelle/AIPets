/**
 * Secondary windows of the desktop host.
 *
 * The pet window stays in `main.cjs`, because the tray, the click-through
 * state, and the close-to-tray rule all read it. This manager owns the other
 * windows: the settings window and the small widget window.
 *
 * Each window remembers its bounds in the main-process store, and the bounds
 * are clamped into a display that is still attached. A window never restores
 * into a monitor that the user unplugged.
 */

const process = require('node:process')

const { BrowserWindow, screen, shell } = require('electron')

const WINDOW_CONFIG = {
  settings: {
    width: 1080,
    height: 740,
    minWidth: 780,
    minHeight: 520,
    route: '/settings',
    title: 'aipets settings',
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    backplate: true,
  },
  chat: {
    width: 460,
    height: 680,
    minWidth: 380,
    minHeight: 480,
    route: '/chat',
    title: 'aipets chat',
    frame: true,
    transparent: false,
    alwaysOnTop: false,
    skipTaskbar: false,
    backplate: true,
  },
  widget: {
    width: 360,
    height: 268,
    minWidth: 300,
    minHeight: 200,
    route: '/widget',
    title: 'aipets widget',
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backplate: false,
  },
}

function intersectionArea(a, b) {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return width * height
}

function centered(area, width, height) {
  const fitWidth = Math.min(width, area.width)
  const fitHeight = Math.min(height, area.height)

  return {
    width: fitWidth,
    height: fitHeight,
    x: Math.round(area.x + (area.width - fitWidth) / 2),
    y: Math.round(area.y + (area.height - fitHeight) / 2),
  }
}

/**
 * Returns the display that holds most of the window, or null when the window
 * lies outside every attached display.
 */
function bestDisplay(bounds) {
  let best = null
  let bestArea = 0

  for (const display of screen.getAllDisplays()) {
    const area = intersectionArea(bounds, display.workArea)
    if (area > bestArea) {
      bestArea = area
      best = display
    }
  }

  return best
}

function clampSize(value, fallback, minimum) {
  if (!Number.isFinite(value))
    return fallback

  return Math.max(minimum, Math.round(value))
}

function normalizeBounds(kind, stored) {
  const config = WINDOW_CONFIG[kind]
  const width = clampSize(stored?.width, config.width, config.minWidth)
  const height = clampSize(stored?.height, config.height, config.minHeight)
  const hasPosition = Number.isFinite(stored?.x) && Number.isFinite(stored?.y)
  const display = hasPosition ? bestDisplay({ x: stored.x, y: stored.y, width, height }) : null

  if (!display)
    return centered(screen.getPrimaryDisplay().workArea, width, height)

  const area = display.workArea
  const fitWidth = Math.min(width, area.width)
  const fitHeight = Math.min(height, area.height)

  return {
    width: fitWidth,
    height: fitHeight,
    x: Math.min(Math.max(stored.x, area.x), area.x + area.width - fitWidth),
    y: Math.min(Math.max(stored.y, area.y), area.y + area.height - fitHeight),
  }
}

class SecondaryWindows {
  constructor({ preloadPath, iconPath, routeUrl, store, mainWindow, onChange }) {
    this.preloadPath = preloadPath
    this.iconPath = iconPath
    this.routeUrl = routeUrl
    this.store = store
    this.mainWindow = mainWindow
    this.onChange = onChange
    this.windows = new Map()
  }

  readBounds(kind) {
    const windows = this.store.get().windows
    if (!windows || typeof windows !== 'object')
      return undefined

    return windows[kind]
  }

  saveBounds(kind, window) {
    if (window.isDestroyed())
      return

    const windows = this.store.get().windows ?? {}
    this.store.set({
      windows: { ...windows, [kind]: window.getNormalBounds() },
    })
  }

  /** Returns the live window of a kind, or null when it is closed. */
  resolve(kind) {
    if (kind === 'main') {
      const window = this.mainWindow()
      return window && !window.isDestroyed() ? window : null
    }

    const window = this.windows.get(kind)
    if (window && !window.isDestroyed())
      return window

    this.windows.delete(kind)
    return null
  }

  list() {
    return ['main', ...Object.keys(WINDOW_CONFIG)].map((kind) => {
      const window = this.resolve(kind)
      return {
        kind,
        open: Boolean(window),
        visible: window?.isVisible() ?? false,
        focused: window?.isFocused() ?? false,
        fullscreen: window?.isFullScreen() ?? false,
        alwaysOnTop: window?.isAlwaysOnTop() ?? false,
      }
    })
  }

  notify() {
    this.onChange?.(this.list())
  }

  options(kind, bounds) {
    const config = WINDOW_CONFIG[kind]
    const base = {
      ...bounds,
      minWidth: config.minWidth,
      minHeight: config.minHeight,
      title: config.title,
      icon: this.iconPath,
      frame: config.frame,
      transparent: config.transparent,
      resizable: true,
      skipTaskbar: config.skipTaskbar,
      alwaysOnTop: config.alwaysOnTop,
      hasShadow: !config.transparent,
      show: false,
      webPreferences: {
        preload: this.preloadPath,
        // The preload requires the shared contract module. Sandboxed preloads
        // cannot load local files, so keep the sandbox off and isolation on.
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
      },
    }

    if (!config.backplate)
      return base

    // The host targets Windows only. Acrylic is the native Windows 11 backdrop.
    if (process.platform === 'win32')
      return { ...base, backgroundMaterial: 'acrylic' }

    return { ...base, backgroundColor: '#0e0e12' }
  }

  open(kind, route) {
    const config = WINDOW_CONFIG[kind]
    if (!config)
      throw new Error(`Unknown window kind: ${kind}`)

    const existing = this.resolve(kind)
    if (existing) {
      existing.show()
      existing.focus()
      this.notify()
      return existing
    }

    const bounds = normalizeBounds(kind, this.readBounds(kind))
    const window = new BrowserWindow(this.options(kind, bounds))
    this.windows.set(kind, window)

    window.once('ready-to-show', () => window.show())
    window.on('move', () => this.saveBounds(kind, window))
    window.on('resize', () => this.saveBounds(kind, window))
    window.on('enter-full-screen', () => this.notify())
    window.on('leave-full-screen', () => this.notify())
    window.on('closed', () => {
      this.windows.delete(kind)
      this.notify()
    })

    window.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    void window.loadURL(this.routeUrl(route ?? config.route))
    this.notify()
    return window
  }

  close(kind) {
    const window = this.resolve(kind)
    if (!window)
      return false

    window.close()
    return true
  }

  focus(kind) {
    const window = this.resolve(kind)
    if (!window)
      return false

    if (!window.isVisible())
      window.show()

    window.focus()
    return true
  }

  toggleFullscreen(kind) {
    const window = this.resolve(kind)
    if (!window)
      return false

    const next = !window.isFullScreen()
    window.setFullScreen(next)
    this.notify()
    return next
  }

  setAlwaysOnTop(kind, value) {
    const window = this.resolve(kind)
    if (!window)
      return false

    window.setAlwaysOnTop(Boolean(value), 'screen-saver')
    this.notify()
    return window.isAlwaysOnTop()
  }

  /**
   * Moves a window back into a visible display after a monitor change.
   */
  reflow() {
    for (const kind of this.windows.keys()) {
      const window = this.resolve(kind)
      if (!window || window.isFullScreen())
        continue

      const current = window.getBounds()
      const next = normalizeBounds(kind, current)
      if (
        next.x !== current.x
        || next.y !== current.y
        || next.width !== current.width
        || next.height !== current.height
      ) {
        window.setBounds(next)
      }
    }

    this.notify()
  }

  closeAll() {
    for (const window of this.windows.values()) {
      if (!window.isDestroyed())
        window.destroy()
    }

    this.windows.clear()
  }
}

module.exports = { SecondaryWindows, WINDOW_CONFIG }
