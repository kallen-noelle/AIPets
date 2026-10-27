/** The desktop host information the preload exposes. */
export interface DesktopInfo {
  platform: string
  versions: { electron?: string, chrome?: string }
  clickThrough: boolean
  visible: boolean
}

/** The bridge the Electron preload installs. */
export interface DesktopBridge {
  platform: string
  versions: { electron?: string, chrome?: string }
  getInfo: () => Promise<DesktopInfo>
  setClickThrough: (value: boolean) => Promise<boolean>
  setVisible: (value: boolean) => Promise<boolean>
  onVisibilityChanged: (listener: (payload: { clickThrough: boolean }) => void) => () => void
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
