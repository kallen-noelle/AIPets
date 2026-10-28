import { useSyncExternalStore } from 'react'

import { readStored } from '../settings/persisted'

export interface Sticker {
  id: string
  name: string
  /** Data URL of the image. It stays on this device. */
  dataUrl: string
  createdAt: number
}

export const stickerLibraryKey = 'airi:react:stickers/library'
export const stickersEnabledKey = 'settings/stickers/enabled'
export const stickersFrequencyKey = 'settings/stickers/frequency'

/** Upper bound on stored stickers, so local storage stays small. */
const maxStickers = 24
/** Upper bound on one image, in bytes of the data URL. */
const maxStickerBytes = 1_500_000

function readLibrary(): Sticker[] {
  try {
    const raw = localStorage.getItem(stickerLibraryKey)
    if (!raw)
      return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed))
      return []
    return parsed.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null)
        return []
      const sticker = entry as { id?: unknown, name?: unknown, dataUrl?: unknown, createdAt?: unknown }
      if (typeof sticker.dataUrl !== 'string' || !sticker.dataUrl)
        return []
      return [{
        id: typeof sticker.id === 'string' ? sticker.id : crypto.randomUUID(),
        name: typeof sticker.name === 'string' ? sticker.name : 'sticker',
        dataUrl: sticker.dataUrl,
        createdAt: typeof sticker.createdAt === 'number' ? sticker.createdAt : Date.now(),
      }]
    })
  }
  catch {
    return []
  }
}

let stickers: Sticker[] = readLibrary()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners)
    listener()
}

function persist(next: Sticker[]) {
  stickers = next.slice(0, maxStickers)
  localStorage.setItem(stickerLibraryKey, JSON.stringify(stickers))
  emit()
}

export function getStickers(): Sticker[] {
  return stickers
}

export function subscribeStickers(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useStickers(): Sticker[] {
  return useSyncExternalStore(subscribeStickers, getStickers, getStickers)
}

/** Adds one image and returns its entry, or null when it does not fit. */
export function addSticker(name: string, dataUrl: string): Sticker | null {
  if (!dataUrl.startsWith('data:image/') || dataUrl.length > maxStickerBytes)
    return null

  const sticker: Sticker = {
    id: crypto.randomUUID(),
    name: name.trim() || 'sticker',
    dataUrl,
    createdAt: Date.now(),
  }

  persist([sticker, ...stickers])
  return sticker
}

export function removeSticker(id: string) {
  persist(stickers.filter(sticker => sticker.id !== id))
}

/** The reply chance in percent. Zero when stickers are off. */
export function stickerReplyChance(): number {
  if (!readStored(stickersEnabledKey, false))
    return 0
  const parsed = readStored(stickersFrequencyKey, 50)
  if (!Number.isFinite(parsed))
    return 50
  return Math.min(100, Math.max(0, parsed))
}

/** Picks the sticker for one reply, or null when no sticker fits. */
export function pickSticker(): Sticker | null {
  if (!stickers.length)
    return null
  if (Math.random() * 100 >= stickerReplyChance())
    return null
  return stickers[Math.floor(Math.random() * stickers.length)] ?? null
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== stickerLibraryKey)
      return
    stickers = readLibrary()
    emit()
  })
}
