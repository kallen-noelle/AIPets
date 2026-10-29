/** The desktop host information the preload exposes. */
export interface DesktopInfo {
  platform: string
  versions: { electron?: string, chrome?: string }
  clickThrough: boolean
  visible: boolean
}

export interface DesktopPreferences {
  closeToTray: boolean
}

export type DesktopPowerEventType
  = | 'suspend'
    | 'resume'
    | 'lock-screen'
    | 'unlock-screen'
    | 'on-ac'
    | 'on-battery'
    | 'shutdown'
    | 'user-did-become-active'
    | 'user-did-resign-active'

export interface DesktopPowerEvent {
  type: DesktopPowerEventType
  at: number
}

export interface DesktopPowerState {
  platform: string
  onBatteryPower: boolean
  idleState: 'active' | 'idle' | 'locked' | 'unknown'
  idleSeconds: number
}

export interface DesktopRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DesktopDisplay {
  id: number
  label: string
  primary: boolean
  bounds: DesktopRect
  workArea: DesktopRect
  scaleFactor: number
}

export interface PetInstanceTarget {
  id: string
  characterId: string
}

export interface DesktopPluginBinding {
  moduleId: string
  title: string
}

export interface DesktopPluginLog {
  at: number
  level: string
  message: string
}

export interface DesktopPlugin {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  loaded: boolean
  error: string | null
  bindings: DesktopPluginBinding[]
  logs: DesktopPluginLog[]
}

export type DesktopWindowKind = 'main' | 'settings' | 'widget' | 'chat'

/** State of one window the main process owns. */
export interface DesktopWindowSummary {
  kind: DesktopWindowKind
  open: boolean
  visible: boolean
  focused: boolean
  fullscreen: boolean
  alwaysOnTop: boolean
}

/** The bridge the Electron preload installs. */
export interface DesktopBridge {
  platform: string
  versions: { electron?: string, chrome?: string }
  getInfo: () => Promise<DesktopInfo>
  setClickThrough: (value: boolean) => Promise<boolean>
  setVisible: (value: boolean) => Promise<boolean>
  onVisibilityChanged: (listener: (payload: { clickThrough: boolean }) => void) => () => void

  getPreferences: () => Promise<DesktopPreferences>
  setPreferences: (patch: Partial<DesktopPreferences>) => Promise<DesktopPreferences>
  onPreferencesChanged: (listener: (preferences: DesktopPreferences) => void) => () => void
  getPowerState: () => Promise<DesktopPowerState>
  onPowerEvent: (listener: (payload: DesktopPowerEvent) => void) => () => void
  listDisplays: () => Promise<DesktopDisplay[]>
  onDisplaysChanged: (listener: (displays: DesktopDisplay[]) => void) => () => void

  listWindows: () => Promise<DesktopWindowSummary[]>
  openWindow: (kind: DesktopWindowKind, route?: string) => Promise<DesktopWindowSummary[]>
  closeWindow: (kind: DesktopWindowKind) => Promise<DesktopWindowSummary[]>
  focusWindow: (kind: DesktopWindowKind) => Promise<boolean>
  toggleWindowFullscreen: (kind: DesktopWindowKind) => Promise<boolean>
  setWindowAlwaysOnTop: (kind: DesktopWindowKind, value: boolean) => Promise<boolean>
  onWindowsChanged: (listener: (windows: DesktopWindowSummary[]) => void) => () => void

  /** Sends one animation signal to the pet window. */
  sendPetEvent: (message: unknown) => void
  onPetEvent: (listener: (message: unknown) => void) => () => void
  /** Reports the character rectangle in CSS pixels. Clicks outside it pass through. */
  reportPetHitbox: (rect: { x: number, y: number, width: number, height: number }) => void
  /** Starts and stops moving the pet window with the pointer. */
  beginPetDrag: () => void
  endPetDrag: () => void
  /** Sizes the pet window to the character, so a larger character is not clipped. */
  setPetScale: (scale: number) => void
  /** Creates or closes one pet window per instance and returns the live ids. */
  syncPetInstances: (instances: PetInstanceTarget[]) => Promise<string[]>

  listPlugins: () => Promise<DesktopPlugin[]>
  installPlugin: () => Promise<DesktopPlugin[]>
  setPluginEnabled: (id: string, enabled: boolean) => Promise<DesktopPlugin[]>
  removePlugin: (id: string) => Promise<DesktopPlugin[]>
  openPluginBinding: (id: string, moduleId: string) => Promise<boolean>
  closePluginBinding: (id: string, moduleId: string) => Promise<boolean>
}

declare global {
  interface Window {
    aipetdexDesktop?: DesktopBridge
  }
}

/** Returns the bridge in the desktop app, or null in a browser tab. */
export function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined')
    return null

  return window.aipetdexDesktop ?? null
}

export function isDesktop(): boolean {
  return getDesktopBridge() !== null
}
