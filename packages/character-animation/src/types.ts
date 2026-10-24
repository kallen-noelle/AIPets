import type { AnimationManifest } from './schema'

export type BaseChain = 'idle' | 'talk' | 'thinking'
export type ClickArea = 'head' | 'body'
export type AnimationAudioMode = 'keep' | 'mute'

export interface NormalizedClip {
  id: string
  src: string
  weight: number
  loop: boolean
  fadeMs?: number
}

export interface EmotionClips {
  low: NormalizedClip[]
  high: NormalizedClip[]
}

export interface LoadedPack {
  manifest: AnimationManifest
  chains: Record<BaseChain, NormalizedClip[]>
  click: Record<ClickArea | 'default', NormalizedClip[]>
  emotions: Record<string, EmotionClips>
  actions: Record<string, NormalizedClip[]>
  expressions: Record<string, NormalizedClip[]>
  beat: NormalizedClip[]
  look: Partial<Record<'left' | 'right', NormalizedClip>>
  allClips: NormalizedClip[]
}

export interface PackSummary {
  id: string
  name: string
  canvas: { width: number, height: number }
  previewUrl?: string
  clipCount: number
}

export type ManifestParseResult
  = | { ok: true, pack: LoadedPack }
    | { ok: false, issues: string[] }

export type AnimationIntent
  = | { kind: 'idle' }
    | { kind: 'talk', speaking: boolean }
    | { kind: 'emotion', emotion: string, intensity?: number }
    | { kind: 'action', name: string }
    | { kind: 'expression', name: string }
    | { kind: 'click', area?: ClickArea }
    | { kind: 'thinking', value: boolean }
    | { kind: 'beat', strength?: number }

export type AnimationEvent
  = | { type: 'idle' }
    | { type: 'speaking', value: boolean }
    | { type: 'thinking', value: boolean }
    | { type: 'emotion', emotion: string, intensity?: number }
    | { type: 'action', name: string }
    | { type: 'expression', name: string }
    | { type: 'click', area?: ClickArea }
    | { type: 'paused', value: boolean }

export type AnimationCommand
  = | { type: 'play', clip: NormalizedClip, fadeMs: number }
    | { type: 'pause' }
    | { type: 'resume' }

export interface AnimationPlaybackSnapshot {
  base: BaseChain
  currentClipId: string | null
  oneShotClipId: string | null
  paused: boolean
}

export interface AnimationPlayerPort {
  play: (clipId: string, options?: { fadeMs?: number }) => Promise<void>
  pause: () => void
  resume: () => void
  currentClipId: () => string | null
}

export interface AnimationClockPort {
  now: () => number
  setTimer: (delayMs: number, callback: () => void) => () => void
}

export interface AnimationPackStore {
  list: () => Promise<PackSummary[]>
  load: (id: string) => Promise<LoadedPack>
}
