import type { AnimationManifest } from './schema'

export type BaseChain = 'idle' | 'talk' | 'thinking' | 'waiting'
export type ClickArea = 'head' | 'body'
export type AnimationAudioMode = 'keep' | 'mute'

export interface NormalizedClip {
  id: string
  src: string
  weight: number
  loop: boolean
  fadeMs?: number
  /** Known clip length. The mid clip of a long action needs it. */
  durationMs?: number
}

/** Phases of a long action. The mid clip repeats until the requested duration is covered. */
export type LongActionPhase = 'start' | 'mid' | 'end'

export interface LongActionClips {
  start?: NormalizedClip
  mid: NormalizedClip
  end?: NormalizedClip
  defaultDurationMs?: number
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
  longActions: Record<string, LongActionClips>
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

/** How an explicit stop finishes a long action. */
export type LongActionStopMode = 'end' | 'cut'

export type AnimationIntent
  = | { kind: 'idle' }
    | { kind: 'talk', speaking: boolean }
    | { kind: 'emotion', emotion: string, intensity?: number }
    | { kind: 'action', name: string, durationMs?: number }
    | { kind: 'longActionStop', mode?: LongActionStopMode }
    | { kind: 'expression', name: string }
    | { kind: 'click', area?: ClickArea }
    | { kind: 'thinking', value: boolean }
    | { kind: 'beat', strength?: number }

export type AnimationEvent
  = | { type: 'idle' }
    | { type: 'speaking', value: boolean }
    | { type: 'thinking', value: boolean }
    | { type: 'emotion', emotion: string, intensity?: number }
    | { type: 'action', name: string, durationMs?: number }
    | { type: 'longActionStop', mode?: LongActionStopMode }
    | { type: 'expression', name: string }
    | { type: 'click', area?: ClickArea }
    | { type: 'playClip', clipId: string }
    | { type: 'setState', clipId: string }
    | { type: 'clearState' }
    | { type: 'paused', value: boolean }
    | { type: 'waiting', value: boolean }

export type AnimationCommand
  = | { type: 'play', clip: NormalizedClip, fadeMs: number }
    | { type: 'pause' }
    | { type: 'resume' }

export interface AnimationPlaybackSnapshot {
  base: BaseChain
  currentClipId: string | null
  oneShotClipId: string | null
  stateClipId: string | null
  longActionName: string | null
  longActionPhase: LongActionPhase | null
  paused: boolean
  /** True while the session waits for the next user input. */
  waiting: boolean
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
