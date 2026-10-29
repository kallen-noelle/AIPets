import type { CharacterCatalog, LoadedPack, PackSummary } from '@proj-aipets/character-animation'

import { parseAnimationManifest, parseCharacterCatalog } from '@proj-aipets/character-animation'

import { prefetchAssets, readCachedAsset } from './asset-cache'

export interface LocalAnimationPack {
  pack: LoadedPack
  /** Optional semantic catalog used by AI direction and explicit clip plans. */
  catalog?: CharacterCatalog
  summary: PackSummary
  /** Turns a manifest-relative clip path into a URL the browser can load. */
  resolve: (src: string) => string
  /** Releases the blob URLs that came from the local asset cache. */
  dispose: () => void
}

async function loadCatalog(base: URL): Promise<CharacterCatalog | undefined> {
  let response: Response
  try {
    response = await fetch(new URL('catalog.json', base))
  }
  catch {
    return undefined
  }

  if (!response.ok)
    return undefined

  // The Vite dev server and some static hosts return index.html with status
  // 200 for an unknown path. A catalog must be JSON, so an HTML fallback means
  // this pack has no catalog.
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json'))
    return undefined

  const parsed = parseCharacterCatalog(await response.json())
  if (!parsed.ok)
    throw new Error(`Invalid animation catalog: ${parsed.issues.join('; ')}`)
  return parsed.catalog
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
  const catalog = await loadCatalog(base)

  // Clips that the cache already holds become blob URLs, so the first frame
  // does not wait for the network. The rest are copied in the background.
  const cached = new Map<string, string>()
  const objectUrls: string[] = []

  for (const clip of pack.allClips) {
    const blob = await readCachedAsset(new URL(clip.src, base).href)
    if (!blob)
      continue

    const objectUrl = URL.createObjectURL(blob)
    cached.set(clip.src, objectUrl)
    objectUrls.push(objectUrl)
  }

  const assetUrls = pack.allClips.map(clip => new URL(clip.src, base).href)
  if (pack.manifest.preview)
    assetUrls.push(new URL(pack.manifest.preview, base).href)

  void prefetchAssets(assetUrls)

  return {
    pack,
    ...(catalog ? { catalog } : {}),
    resolve: src => cached.get(src) ?? new URL(src, base).href,
    summary: {
      id: pack.manifest.id,
      name: pack.manifest.name,
      canvas: pack.manifest.canvas,
      previewUrl: pack.manifest.preview ? new URL(pack.manifest.preview, base).href : undefined,
      clipCount: pack.allClips.length,
    },
    dispose: () => {
      for (const objectUrl of objectUrls)
        URL.revokeObjectURL(objectUrl)

      objectUrls.length = 0
      cached.clear()
    },
  }
}
