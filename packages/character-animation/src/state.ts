import type { RandomSource } from './picker'
import type {
  AnimationCommand,
  AnimationEvent,
  AnimationPlaybackSnapshot,
  BaseChain,
  ClickArea,
  LoadedPack,
  NormalizedClip,
} from './types'

import { WeightedPicker } from './picker'

export interface AnimationControllerOptions {
  random?: RandomSource
  defaultFadeMs?: number
}

interface InternalState {
  base: BaseChain
  current: NormalizedClip | null
  oneShot: NormalizedClip | null
  paused: boolean
  speaking: boolean
  lastByChain: Partial<Record<BaseChain, string>>
}

const defaultFadeMs = 180
const highIntensity = 0.6

function chooseTier(pack: LoadedPack, emotion: string, intensity: number): NormalizedClip[] {
  const entry = pack.emotions[emotion]
  if (!entry)
    return []
  return intensity >= highIntensity && entry.high.length ? entry.high : entry.low
}

function chooseClick(pack: LoadedPack, area?: ClickArea): NormalizedClip[] {
  if (area === 'head' && pack.click.head.length)
    return pack.click.head
  if (area === 'body' && pack.click.body.length)
    return pack.click.body
  return pack.click.default
}

export class AnimationController {
  private readonly pack: LoadedPack
  private readonly picker: WeightedPicker
  private readonly fallbackFadeMs: number
  private state: InternalState

  constructor(pack: LoadedPack, options: AnimationControllerOptions = {}) {
    this.pack = pack
    this.picker = new WeightedPicker(options.random)
    this.fallbackFadeMs = options.defaultFadeMs ?? defaultFadeMs
    this.state = {
      base: 'idle',
      current: null,
      oneShot: null,
      paused: false,
      speaking: false,
      lastByChain: {},
    }
  }

  get snapshot(): AnimationPlaybackSnapshot {
    return {
      base: this.state.base,
      currentClipId: this.state.current?.id ?? null,
      oneShotClipId: this.state.oneShot?.id ?? null,
      paused: this.state.paused,
    }
  }

  dispatch(event: AnimationEvent): AnimationCommand[] {
    switch (event.type) {
      case 'idle':
        return this.enterBase('idle')
      case 'speaking':
        return this.handleSpeaking(event.value)
      case 'thinking':
        return this.handleThinking(event.value)
      case 'emotion':
        return this.playOneShot(chooseTier(this.pack, event.emotion, event.intensity ?? 1))
      case 'action':
        return this.playOneShot(this.pack.actions[event.name] ?? [])
      case 'expression':
        return this.playOneShot(this.pack.expressions[event.name] ?? [])
      case 'click':
        return this.playOneShot(chooseClick(this.pack, event.area))
      case 'paused':
        return this.handlePaused(event.value)
    }
  }

  clipEnded(clipId: string): AnimationCommand[] {
    if (this.state.paused)
      return []

    if (this.state.oneShot?.id === clipId) {
      this.state.oneShot = null
      return this.playFromChain(this.state.base)
    }

    if (this.state.current?.id === clipId)
      return this.playFromChain(this.state.base)

    return []
  }

  private handleSpeaking(value: boolean): AnimationCommand[] {
    if (value) {
      this.state.speaking = true
      this.state.oneShot = null
      return this.enterBase('talk')
    }

    this.state.speaking = false
    return this.enterBase('idle')
  }

  private handleThinking(value: boolean): AnimationCommand[] {
    if (value && !this.state.speaking) {
      this.state.oneShot = null
      return this.enterBase('thinking')
    }

    if (!value)
      return this.enterBase(this.state.speaking ? 'talk' : 'idle')

    return []
  }

  private handlePaused(value: boolean): AnimationCommand[] {
    if (this.state.paused === value)
      return []

    this.state.paused = value
    return [{ type: value ? 'pause' : 'resume' }]
  }

  private enterBase(chain: BaseChain): AnimationCommand[] {
    const chainChanged = this.state.base !== chain
    this.state.base = chain

    if (!chainChanged && !this.state.oneShot && this.state.current)
      return []

    this.state.oneShot = null
    return this.playFromChain(chain)
  }

  private playOneShot(clips: NormalizedClip[]): AnimationCommand[] {
    const clip = this.picker.pick(clips)
    if (!clip)
      return []

    this.state.oneShot = clip
    this.state.current = clip
    return [{ type: 'play', clip, fadeMs: this.fadeFor(clip) }]
  }

  private playFromChain(chain: BaseChain): AnimationCommand[] {
    const clips = this.pack.chains[chain]
    const lastId = this.state.lastByChain[chain]
    const clip = this.picker.pick(clips, lastId)
    if (!clip)
      return []

    this.state.current = clip
    this.state.lastByChain[chain] = clip.id
    return [{ type: 'play', clip, fadeMs: this.fadeFor(clip) }]
  }

  private fadeFor(clip: NormalizedClip): number {
    return clip.fadeMs ?? this.pack.manifest.transition?.fadeMs ?? this.fallbackFadeMs
  }
}
