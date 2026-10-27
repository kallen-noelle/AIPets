import type { RawClipEntry, RawEmotionEntry, RawLongActionEntry } from './schema'
import type { EmotionClips, LoadedPack, LongActionClips, ManifestParseResult, NormalizedClip } from './types'

import * as v from 'valibot'

import { manifestSchema } from './schema'

const videoExtensions = ['.webm', '.mov', '.mp4']
const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp']

function normalizeSrc(src: string): string {
  return src.replace(/\\/g, '/').replace(/^\.\//, '')
}

function validateSrc(src: string, extensions: string[]): string | undefined {
  const normalized = normalizeSrc(src)
  if (!normalized)
    return 'path is empty'
  if (normalized.startsWith('/'))
    return `path must be relative: ${src}`
  if (normalized.includes('://') || normalized.includes(':'))
    return `path must not contain a protocol: ${src}`
  if (normalized.split('/').includes('..'))
    return `path must not contain "..": ${src}`
  const lower = normalized.toLowerCase()
  if (!extensions.some(extension => lower.endsWith(extension)))
    return `unsupported extension: ${src}`
  return undefined
}

function normalizeClip(entry: RawClipEntry, defaultLoop: boolean): NormalizedClip {
  const raw = typeof entry === 'string'
    ? { src: entry, weight: 1, loop: defaultLoop, fadeMs: undefined, durationMs: undefined }
    : {
        src: entry.src,
        weight: entry.weight ?? 1,
        loop: entry.loop ?? defaultLoop,
        fadeMs: entry.fadeMs,
        durationMs: entry.durationMs,
      }

  const src = normalizeSrc(raw.src)
  return {
    id: src,
    src,
    weight: raw.weight,
    loop: raw.loop,
    fadeMs: raw.fadeMs,
    durationMs: raw.durationMs,
  }
}

function normalizeClipList(entries: RawClipEntry[] | undefined, defaultLoop: boolean): NormalizedClip[] {
  return (entries ?? []).map(entry => normalizeClip(entry, defaultLoop))
}

function normalizeEmotion(entry: RawEmotionEntry, defaultLoop: boolean, issues: string[], emotion: string): EmotionClips {
  if (Array.isArray(entry)) {
    const clips = normalizeClipList(entry, defaultLoop)
    if (!clips.length)
      issues.push(`emotion "${emotion}" has no clips`)
    return { low: clips, high: clips }
  }

  const low = normalizeClipList(entry.low, defaultLoop)
  const high = normalizeClipList(entry.high, defaultLoop)
  const fallback = low.length ? low : high
  if (!fallback.length)
    issues.push(`emotion "${emotion}" has no clips`)
  return {
    low: low.length ? low : fallback,
    high: high.length ? high : fallback,
  }
}

function asOneShot(clip: NormalizedClip): NormalizedClip {
  return clip.loop ? { ...clip, loop: false } : clip
}

function normalizeLongAction(entry: RawLongActionEntry, name: string, issues: string[]): LongActionClips {
  const start = entry.start ? asOneShot(normalizeClip(entry.start, false)) : undefined
  const loop = asOneShot(normalizeClip(entry.loop, false))
  const end = entry.end ? asOneShot(normalizeClip(entry.end, false)) : undefined

  // The timer owns the total duration. The loop length is only a fallback when
  // neither the caller nor the manifest provides one.
  if (!loop.durationMs && !entry.defaultDurationMs)
    issues.push(`long action "${name}": loop clip needs durationMs or defaultDurationMs`)

  return {
    start,
    loop,
    end,
    defaultDurationMs: entry.defaultDurationMs,
  }
}

export function parseAnimationManifest(input: unknown): ManifestParseResult {
  const result = v.safeParse(manifestSchema, input)
  if (!result.success) {
    const issues = result.issues.map((issue) => {
      const path = issue.path?.map(item => String(item.key)).join('.')
      return path ? `${path}: ${issue.message}` : issue.message
    })
    return { ok: false, issues }
  }

  const manifest = result.output
  const issues: string[] = []

  const previewPath = manifest.preview ? normalizeSrc(manifest.preview) : undefined
  if (previewPath) {
    const previewIssue = validateSrc(previewPath, imageExtensions)
    if (previewIssue)
      issues.push(`preview: ${previewIssue}`)
  }

  const chains = {
    idle: normalizeClipList(manifest.animations.idle, true),
    talk: normalizeClipList(manifest.animations.talk, true),
    thinking: normalizeClipList(manifest.animations.thinking, true),
    waiting: normalizeClipList(manifest.animations.waiting, true),
  }
  if (!chains.talk.length)
    chains.talk = chains.idle
  if (!chains.thinking.length)
    chains.thinking = chains.idle
  if (!chains.waiting.length)
    chains.waiting = chains.idle

  const click = {
    head: [] as NormalizedClip[],
    body: [] as NormalizedClip[],
    default: [] as NormalizedClip[],
  }
  if (Array.isArray(manifest.animations.click)) {
    click.default = normalizeClipList(manifest.animations.click, false)
    click.head = click.default
    click.body = click.default
  }
  else if (manifest.animations.click) {
    click.head = normalizeClipList(manifest.animations.click.head, false)
    click.body = normalizeClipList(manifest.animations.click.body, false)
    click.default = normalizeClipList(manifest.animations.click.default, false)
    if (!click.default.length)
      click.default = [...click.head, ...click.body]
    if (!click.default.length)
      issues.push('click has no clips')
  }

  const emotions: Record<string, EmotionClips> = {}
  for (const [emotion, entry] of Object.entries(manifest.animations.emotion ?? {}))
    emotions[emotion] = normalizeEmotion(entry, false, issues, emotion)

  const actions: Record<string, NormalizedClip[]> = {}
  for (const [name, entry] of Object.entries(manifest.animations.actions ?? {}))
    actions[name] = [normalizeClip(entry, false)]

  const longActions: Record<string, LongActionClips> = {}
  for (const [name, entry] of Object.entries(manifest.animations.longActions ?? {}))
    longActions[name] = normalizeLongAction(entry, name, issues)

  const expressions: Record<string, NormalizedClip[]> = {}
  for (const [name, entry] of Object.entries(manifest.animations.expressions ?? {}))
    expressions[name] = [normalizeClip(entry, false)]

  const beat = normalizeClipList(manifest.animations.beat, false)
  const look: LoadedPack['look'] = {}
  if (manifest.animations.look?.left)
    look.left = normalizeClip(manifest.animations.look.left, false)
  if (manifest.animations.look?.right)
    look.right = normalizeClip(manifest.animations.look.right, false)

  const allClips: NormalizedClip[] = []
  const seen = new Set<string>()
  const addClips = (clips: NormalizedClip[]) => {
    for (const clip of clips) {
      if (seen.has(clip.id))
        continue
      seen.add(clip.id)
      allClips.push(clip)
    }
  }

  for (const chain of Object.values(chains))
    addClips(chain)
  addClips(click.default)
  addClips(click.head)
  addClips(click.body)
  for (const emotion of Object.values(emotions)) {
    addClips(emotion.low)
    addClips(emotion.high)
  }
  for (const clips of Object.values(actions))
    addClips(clips)
  for (const longAction of Object.values(longActions)) {
    if (longAction.start)
      addClips([longAction.start])
    addClips([longAction.loop])
    if (longAction.end)
      addClips([longAction.end])
  }
  for (const clips of Object.values(expressions))
    addClips(clips)
  addClips(beat)
  if (look.left)
    addClips([look.left])
  if (look.right)
    addClips([look.right])

  for (const clip of allClips) {
    const issue = validateSrc(clip.src, videoExtensions)
    if (issue)
      issues.push(issue)
  }

  if (issues.length)
    return { ok: false, issues }

  const pack: LoadedPack = {
    manifest,
    chains,
    click,
    emotions,
    actions,
    longActions,
    expressions,
    beat,
    look,
    allClips,
  }

  return { ok: true, pack }
}
