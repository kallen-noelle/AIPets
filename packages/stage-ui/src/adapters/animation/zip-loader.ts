import type { LoadedPack } from '@proj-airi/character-animation'

import JSZip from 'jszip'

import { parseAnimationManifest } from '@proj-airi/character-animation'

export interface LoadedAnimationPack {
  pack: LoadedPack
  /** Object URLs of the extracted clips, keyed by the normalized `src` of each clip. */
  sources: Record<string, string>
  previewUrl?: string
  /** Releases every object URL that this loader created. */
  dispose: () => void
}

const manifestFileName = 'manifest.json'

/**
 * Picks the shallowest `manifest.json` so a pack that wraps its content in a
 * single folder still loads.
 */
function findManifestPath(zip: JSZip): string | undefined {
  return Object.keys(zip.files)
    .filter(path => !zip.files[path].dir && path.split('/').pop() === manifestFileName)
    .sort((a, b) => a.split('/').length - b.split('/').length)[0]
}

function resolveEntryPath(root: string, src: string): string {
  return `${root}${src.replace(/\\/g, '/')}`
}

function toBlobUrlRegistry() {
  const urls: string[] = []

  return {
    create(blob: Blob) {
      const url = URL.createObjectURL(blob)
      urls.push(url)
      return url
    },
    revokeAll() {
      for (const url of urls)
        URL.revokeObjectURL(url)
      urls.length = 0
    },
  }
}

/**
 * Extracts an animation pack ZIP into object URLs that a `<video>` element can play.
 *
 * @example
 * const loaded = await loadAnimationPack(zipFile)
 * video.src = loaded.sources[loaded.pack.chains.idle[0].src]
 */
export async function loadAnimationPack(file: File): Promise<LoadedAnimationPack> {
  const zip = await JSZip.loadAsync(file)
  const manifestPath = findManifestPath(zip)
  if (!manifestPath)
    throw new Error(`Animation pack has no ${manifestFileName}`)

  const manifestFile = zip.file(manifestPath)
  if (!manifestFile)
    throw new Error(`Animation pack has no ${manifestFileName}`)

  const manifestText = await manifestFile.async('text')
  let manifestInput: unknown
  try {
    manifestInput = JSON.parse(manifestText)
  }
  catch {
    throw new Error(`${manifestFileName} is not valid JSON`)
  }

  const parsed = parseAnimationManifest(manifestInput)
  if (!parsed.ok)
    throw new Error(`Invalid animation pack: ${parsed.issues.join('; ')}`)

  const pack = parsed.pack
  const root = manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1) : ''
  const urls = toBlobUrlRegistry()

  try {
    const sources: Record<string, string> = {}
    for (const clip of pack.allClips) {
      const entry = zip.file(resolveEntryPath(root, clip.src))
      if (!entry)
        throw new Error(`Missing clip file: ${clip.src}`)
      sources[clip.src] = urls.create(await entry.async('blob'))
    }

    let previewUrl: string | undefined
    if (pack.manifest.preview) {
      const entry = zip.file(resolveEntryPath(root, pack.manifest.preview))
      if (entry)
        previewUrl = urls.create(await entry.async('blob'))
    }

    return {
      pack,
      sources,
      previewUrl,
      dispose: () => urls.revokeAll(),
    }
  }
  catch (error) {
    urls.revokeAll()
    throw error
  }
}
