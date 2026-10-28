/**
 * Local storage for animation assets.
 *
 * A clip file is large, so a pack that the app loads from a URL is fetched
 * once and kept in Cache Storage. The next start reads the clip from disk
 * instead of the network, and the pack works offline.
 *
 * Cache Storage only accepts http and https, so a blob or a custom scheme URL
 * passes through untouched.
 */

const CACHE_NAME = 'aipetdex-animation-assets'

function cacheSupported(): boolean {
  return typeof caches !== 'undefined' && typeof caches.open === 'function'
}

function isCacheable(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  }
  catch {
    return false
  }
}

/** Reads one cached asset. Returns null when the asset is not cached. */
export async function readCachedAsset(url: string): Promise<Blob | null> {
  if (!cacheSupported() || !isCacheable(url))
    return null

  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(url)
    if (!response)
      return null

    return await response.blob()
  }
  catch {
    return null
  }
}

/** Copies one asset into the cache. Returns true when the entry is stored. */
export async function cacheAsset(url: string): Promise<boolean> {
  if (!cacheSupported() || !isCacheable(url))
    return false

  try {
    const cache = await caches.open(CACHE_NAME)
    const existing = await cache.match(url)
    if (existing)
      return true

    const response = await fetch(url)
    if (!response.ok)
      return false

    await cache.put(url, response)
    return true
  }
  catch {
    return false
  }
}

/** Caches every asset of a pack. Returns how many are now stored. */
export async function prefetchAssets(urls: string[]): Promise<number> {
  let stored = 0
  for (const url of urls) {
    if (await cacheAsset(url))
      stored += 1
  }

  return stored
}

export interface AssetCacheStats {
  entries: number
  /** Sum of the reported content lengths. A missing header counts as zero. */
  bytes: number
}

export async function readAssetCacheStats(): Promise<AssetCacheStats> {
  if (!cacheSupported())
    return { entries: 0, bytes: 0 }

  try {
    const cache = await caches.open(CACHE_NAME)
    const requests = await cache.keys()
    let bytes = 0

    for (const request of requests) {
      const response = await cache.match(request)
      const length = Number(response?.headers.get('content-length') ?? 0)
      if (Number.isFinite(length))
        bytes += length
    }

    return { entries: requests.length, bytes }
  }
  catch {
    return { entries: 0, bytes: 0 }
  }
}

export async function clearAssetCache(): Promise<void> {
  if (!cacheSupported())
    return

  try {
    await caches.delete(CACHE_NAME)
  }
  catch {
    // A blocked cache is not a reason to fail the settings page.
  }
}
