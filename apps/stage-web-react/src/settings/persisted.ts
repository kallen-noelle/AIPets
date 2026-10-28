import { useCallback, useEffect, useState } from 'react'

import { onDesktopMessage, postDesktopMessage } from '../desktop/channel'

/**
 * Reads a value that Vue `useLocalStorage` may have written.
 *
 * Vue writes raw text for string, number, and boolean defaults, and JSON for
 * objects. A JSON parse covers both formats. A raw string that is not JSON
 * returns as is.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null)
      return fallback

    return JSON.parse(raw) as T
  }
  catch {
    return (localStorage.getItem(key) ?? fallback) as T
  }
}

/** Writes a string as raw text so Vue reads it back. Other values use JSON. */
export function writeStored<T>(key: string, value: T) {
  localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
  notifyStored(key)
  // Electron keeps one localStorage per origin, but a write here must also
  // reach the other windows of the desktop app without a main-process trip.
  postDesktopMessage({ type: 'settings-changed', key, value })
}

const storedListeners = new Map<string, Set<() => void>>()

function notifyStored(key: string) {
  for (const listener of storedListeners.get(key) ?? [])
    listener()
}

/**
 * Subscribes to writes of one key inside the current tab.
 *
 * The `storage` event only fires in other tabs, so components that share a
 * key need this to see a write from a sibling component.
 */
function subscribeStored(key: string, listener: () => void): () => void {
  const listeners = storedListeners.get(key) ?? new Set<() => void>()
  storedListeners.set(key, listeners)
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
    if (!listeners.size)
      storedListeners.delete(key)
  }
}

/**
 * Reads a Vue `useLocalStorage` compatible value and keeps windows in sync.
 */
export function useStoredValue<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))

  const update = useCallback((next: T) => {
    writeStored(key, next)
    setValue(next)
  }, [key])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key)
        setValue(readStored(key, fallback))
    }

    const unsubscribe = subscribeStored(key, () => setValue(readStored(key, fallback)))
    const unsubscribeChannel = onDesktopMessage((message) => {
      if (message.type === 'settings-changed' && message.key === key)
        setValue(readStored(key, fallback))
    })

    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
      unsubscribe()
      unsubscribeChannel()
    }
  }, [key, fallback])

  return [value, update] as const
}
