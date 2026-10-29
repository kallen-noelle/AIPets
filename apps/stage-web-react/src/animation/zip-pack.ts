import type { CharacterCatalog, LoadedPack } from '@proj-aipets/character-animation'

import type { CharacterProfile } from '../character/characters'

import JSZip from 'jszip'

import { parseAnimationManifest, parseCharacterCatalog } from '@proj-aipets/character-animation'
import { del, get, set } from 'idb-keyval'

import { normalizeCharacterProfile } from '../character/characters'

export interface LoadedZipPack {
  pack: LoadedPack
  /** Optional semantic catalog for AI direction and explicit clip plans. */
  catalog?: CharacterCatalog
  /** Presentation from `character.json`, or defaults from the manifest. */
  profile: CharacterProfile
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

  // A ZIP pack can ship `character.json` next to `manifest.json`. Missing or
  // malformed presentation config falls back to the manifest name and defaults.
  const characterFile = zip.file(`${root}character.json`)
  let profileInput: unknown = null
  if (characterFile) {
    try {
      profileInput = JSON.parse(await characterFile.async('text'))
    }
    catch {
      profileInput = null
    }
  }

  const profile = normalizeCharacterProfile(profileInput, {
    id: pack.manifest.id,
    name: pack.manifest.name,
  })

  // The catalog is optional. A pack without one still plays through the
  // existing weighted state machine, but AI direction stays disabled.
  const catalogFile = zip.file(`${root}catalog.json`)
  let catalog: CharacterCatalog | undefined
  if (catalogFile) {
    const parsedCatalog = parseCharacterCatalog(JSON.parse(await catalogFile.async('text')))
    if (!parsedCatalog.ok)
      throw new Error(`Invalid animation catalog: ${parsedCatalog.issues.join('; ')}`)
    catalog = parsedCatalog.catalog
  }

  const sources: Record<string, string> = {}

  for (const clip of pack.allClips) {
    const entry = zip.file(resolveEntryPath(root, clip.src))
    if (!entry)
      throw new Error(`Missing clip file: ${clip.src}`)
    sources[clip.src] = createUrl(await entry.async('blob'))
  }

  return {
    pack,
    ...(catalog ? { catalog } : {}),
    profile,
    sources,
    dispose: () => {
      for (const url of urls)
        URL.revokeObjectURL(url)
      urls.length = 0
    },
  }
}

const packsMetaKey = 'aipets:react:animation-packs'
const activePackKey = 'aipets:react:active-pack'
const blobKey = (id: string) => `aipets-react-pack-${id}`

export interface PackMeta {
  id: string
  name: string
  profile: CharacterProfile
  canvas: { width: number, height: number }
  clipCount: number
  addedAt: number
}

interface PackMetaInput {
  id: string
  name: string
  canvas: { width: number, height: number }
  clipCount: number
  addedAt: number
  profile?: unknown
}

function isPackMetaInput(value: unknown): value is PackMetaInput {
  if (typeof value !== 'object' || value === null)
    return false

  const entry = value as Partial<PackMetaInput>
  return typeof entry.id === 'string'
    && typeof entry.name === 'string'
    && typeof entry.clipCount === 'number'
    && typeof entry.canvas === 'object'
    && entry.canvas !== null
}

export function listPackMeta(): PackMeta[] {
  try {
    const raw = localStorage.getItem(packsMetaKey)
    if (!raw)
      return []

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed))
      return []

    return parsed.filter(isPackMetaInput).map(pack => ({
      ...pack,
      profile: normalizeCharacterProfile(pack.profile, { id: pack.id, name: pack.name }),
    }))
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
    name: loaded.profile.name,
    profile: loaded.profile,
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
