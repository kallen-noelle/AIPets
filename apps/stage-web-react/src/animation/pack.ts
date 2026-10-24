import type { LoadedPack, PackSummary } from '@proj-airi/character-animation'

import { parseAnimationManifest } from '@proj-airi/character-animation'

export interface LocalAnimationPack {
  pack: LoadedPack
  summary: PackSummary
  /** Turns a manifest-relative clip path into a URL the browser can load. */
  resolve: (src: string) => string
}

/**
 * Loads an animation pack from a manifest served next to its clip files.
 *
 * The manifest paths stay relative, so one pack can move between the dev
 * server, the packaged app, and a remote host without edits.
 */
export async function loadAnimationPackFromUrl(manifestUrl: string): Promise<LocalAnimationPack> {
  const url = new URL(manifestUrl, window.location.href)
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Cannot load animation manifest: HTTP ${response.status}`)

  const parsed = parseAnimationManifest(await response.json())
  if (!parsed.ok)
    throw new Error(`Invalid animation manifest: ${parsed.issues.join('; ')}`)

  const base = new URL('.', url)
  const pack = parsed.pack

  return {
    pack,
    resolve: src => new URL(src, base).href,
    summary: {
      id: pack.manifest.id,
      name: pack.manifest.name,
      canvas: pack.manifest.canvas,
      previewUrl: pack.manifest.preview ? new URL(pack.manifest.preview, base).href : undefined,
      clipCount: pack.allClips.length,
    },
  }
}
