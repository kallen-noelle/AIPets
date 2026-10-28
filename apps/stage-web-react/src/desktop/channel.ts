import type { DesktopPreferences } from './bridge'

/**
 * The channel that keeps desktop windows in sync.
 *
 * Every Electron window of the app shares one origin, so a BroadcastChannel
 * reaches all of them without a round trip through the main process. Main
 * process events use the preload bridge instead.
 */

export type DesktopChannelMessage
  = | { type: 'settings-changed', key: string, value: unknown }
    | { type: 'window-command', command: 'open-settings' | 'open-widget' | 'toggle-pet' }
    | { type: 'preferences-changed', preferences: DesktopPreferences }

const CHANNEL_NAME = 'aipetdex:desktop-channel'

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined')
    return null

  channel ??= new BroadcastChannel(CHANNEL_NAME)
  return channel
}

export function postDesktopMessage(message: DesktopChannelMessage) {
  getChannel()?.postMessage(message)
}

/** Listens for messages from the other windows. Returns an unsubscribe. */
export function onDesktopMessage(listener: (message: DesktopChannelMessage) => void): () => void {
  const target = getChannel()
  if (!target)
    return () => {}

  const handler = (event: MessageEvent<DesktopChannelMessage>) => {
    const data = event.data
    if (data && typeof data === 'object' && typeof data.type === 'string')
      listener(data)
  }

  target.addEventListener('message', handler)
  return () => target.removeEventListener('message', handler)
}
