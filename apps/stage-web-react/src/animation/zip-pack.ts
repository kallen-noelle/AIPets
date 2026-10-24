import type { LoadedPack } from '@proj-airi/character-animation'

import JSZip from 'jszip'

import { parseAnimationManifest } from '@proj-airi/character-animation'
import { del, get, set } from 'idb-keyval'

export interface LoadedZipPack {
  pack: LoadedPack
  /** Object URL per normalized clip path. */
  sources: Record<string, string>
  dispose: () => void
}

const manifestFileName = 'manifest.json'

function findManifestPath(zip: JSZip): string | undefined {
  return Object.keys(zip.files)
    .filter(path => !zip.files[path].dir && path.split('/').pop() === manifestFileName)
    .sort((a, b) => a.split('/').length - b.split('/').length)[0]
}

function resolveEntryPath(root: string, src: string): string {
  return `${root}${src.replace(/\\/g, '/')}`
}

export async function loadPackFromZip(blob: Blob): Promise<LoadedZipPack> {
  const zip = await JSZip.loadAsync(blob)
  const manifestPath = findManifestPath(zip)
  if (!manifestPath)
    throw new Error(`Animation pack has no ${manifestFileName}`)

  const manifestFile = zip.file(manifestPath)
  if (!manifestFile)
    throw new Error(`Animation pack has no ${manifestFileName}`)

  const parsed = parseAnimationManifest(JSON.parse(await manifestFile.async('text')))
  if (!parsed.ok)
    throw new Error(`Invalid animation pack: ${parsed.issues.join('; ')}`)

  const root = manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1) : ''
  const urls: string[] = []
  const createUrl = (value: Blob) => {
    const url = URL.createObjectURL(value)
    urls.push(url)
    return url
  }

  const pack = parsed.pack
  const sources: Record<string, string> = {}

  for (const clip of pack.allClips) {
    const entry = zip.file(resolveEntryPath(root, clip.src))
    if (!entry)
      throw new Error(`Missing clip file: ${clip.src}`)
    sources[clip.src] = createUrl(await entry.async('blob'))
  }

  return {
    pack,
    sources,
    dispose: () => {
      for (const url of urls)
        URL.revokeObjectURL(url)
      urls.length = 0
    },
  }
}

const packsMetaKey = 'airi:react:animation-packs'
const activePackKey = 'airi:react:active-pack'
const blobKey = (id: string) => `airi-react-pack-${id}`

export interface PackMeta {
  id: string
  name: string
  canvas: { width: number, height: number }
  clipCount: number
  addedAt: number
}

export function listPackMeta(): PackMeta[] {
  try {
    const raw = localStorage.getItem(packsMetaKey)
    return raw ? JSON.parse(raw) as PackMeta[] : []
  }
  catch {
    return []
  }
}

function savePackMeta(packs: PackMeta[]) {
  localStorage.setItem(packsMetaKey, JSON.stringify(packs))
}

export async function importPack(file: File): Promise<PackMeta> {
  const loaded = await loadPackFromZip(file)
  const id = crypto.randomUUID()

  await set(blobKey(id), file)

  const meta: PackMeta = {
    id,
    name: loaded.pack.manifest.name,
    canvas: loaded.pack.manifest.canvas,
    clipCount: loaded.pack.allClips.length,
    addedAt: Date.now(),
  }

  loaded.dispose()
  savePackMeta([...listPackMeta(), meta])
  return meta
}

export async function removePack(id: string) {
  savePackMeta(listPackMeta().filter(pack => pack.id !== id))
  await del(blobKey(id))

  if (getActivePackId() === id)
    localStorage.removeItem(activePackKey)
}

export function getActivePackId(): string | null {
  try {
    return JSON.parse(localStorage.getItem(activePackKey) ?? 'null') as string | null
  }
  catch {
    return null
  }
}

export function setActivePackId(id: string | null) {
  if (id)
    localStorage.setItem(activePackKey, JSON.stringify(id))
  else
    localStorage.removeItem(activePackKey)
}

export async function loadStoredPack(id: string): Promise<LoadedZipPack | null> {
  const blob = await get<Blob>(blobKey(id))
  if (!blob)
    return null

  return loadPackFromZip(blob)
}
