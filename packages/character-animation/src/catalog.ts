import * as v from 'valibot'

export type ClipRole = 'loop' | 'oneShot' | 'transition'
export type ClipSemanticSource = 'manifest' | 'inferred' | 'manual'

/**
 * Semantic description of one animation clip.
 *
 * The catalog is the boundary between asset production and AI direction. A
 * director chooses clips by meaning, not by file path.
 */
export interface ClipDescriptor {
  id: string
  name: string
  description: string
  tags: string[]
  /** Emotional tone of the clip, from unpleasant to pleasant. */
  valence: number
  /** Energy of the clip, from calm to activated. */
  arousal: number
  role: ClipRole
  durationMs?: number
  source: ClipSemanticSource
}

export interface CharacterCatalog {
  catalogVersion: 1
  packId: string
  generatedAt: string
  clips: ClipDescriptor[]
}

export interface CatalogIndex {
  byId: Map<string, ClipDescriptor>
  byTag: Map<string, ClipDescriptor[]>
}

export type CatalogParseResult
  = | { ok: true, catalog: CharacterCatalog }
    | { ok: false, issues: string[] }

const clipDescriptorSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  name: v.pipe(v.string(), v.minLength(1)),
  description: v.pipe(v.string(), v.maxLength(300)),
  tags: v.array(v.pipe(v.string(), v.minLength(1))),
  valence: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
  arousal: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  role: v.picklist(['loop', 'oneShot', 'transition']),
  durationMs: v.optional(v.pipe(v.number(), v.minValue(0))),
  source: v.picklist(['manifest', 'inferred', 'manual']),
})

export const characterCatalogSchema = v.object({
  catalogVersion: v.literal(1),
  packId: v.pipe(v.string(), v.minLength(1)),
  generatedAt: v.pipe(v.string(), v.minLength(1)),
  clips: v.pipe(v.array(clipDescriptorSchema), v.minLength(1)),
})

/**
 * Parses a generated catalog and rejects duplicate clip ids.
 *
 * @example
 * parseCharacterCatalog(rawCatalog)
 * // => { ok: true, catalog: { catalogVersion: 1, ... } }
 */
export function parseCharacterCatalog(input: unknown): CatalogParseResult {
  const result = v.safeParse(characterCatalogSchema, input)
  if (!result.success) {
    return {
      ok: false,
      issues: result.issues.map((issue) => {
        const path = issue.path?.map(item => String(item.key)).join('.')
        return path ? `${path}: ${issue.message}` : issue.message
      }),
    }
  }

  const catalog = result.output
  const seen = new Set<string>()
  const issues: string[] = []
  for (const clip of catalog.clips) {
    if (seen.has(clip.id)) {
      issues.push(`duplicate clip id: ${clip.id}`)
      continue
    }
    seen.add(clip.id)
  }

  if (issues.length)
    return { ok: false, issues }

  return { ok: true, catalog }
}

export function createCatalogIndex(catalog: CharacterCatalog): CatalogIndex {
  const byId = new Map<string, ClipDescriptor>()
  const byTag = new Map<string, ClipDescriptor[]>()

  for (const clip of catalog.clips) {
    byId.set(clip.id, clip)
    for (const tag of clip.tags) {
      const bucket = byTag.get(tag)
      if (bucket)
        bucket.push(clip)
      else
        byTag.set(tag, [clip])
    }
  }

  return { byId, byTag }
}

export function findClipDescriptor(catalog: CharacterCatalog, clipId: string): ClipDescriptor | undefined {
  return catalog.clips.find(clip => clip.id === clipId)
}

export function clipHasAnyTag(clip: ClipDescriptor, tags: string[]): boolean {
  return tags.some(tag => clip.tags.includes(tag))
}
