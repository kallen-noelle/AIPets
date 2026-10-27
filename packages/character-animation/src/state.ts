import type { RandomSource } from './picker'
import type {
  AnimationClockPort,
  AnimationCommand,
  AnimationEvent,
  AnimationPlaybackSnapshot,
  BaseChain,
  ClickArea,
  LoadedPack,
  LongActionClips,
  LongActionPhase,
  LongActionStopMode,
  NormalizedClip,
} from './types'

import { WeightedPicker } from './picker'

export interface AnimationControllerOptions {
  random?: RandomSource
  defaultFadeMs?: number
  clock?: AnimationClockPort
  /**
   * Receives commands that no dispatch call produces, such as the long action
   * timer switching to the end clip. The host must apply them like return values.
   */
  onCommands?: (commands: AnimationCommand[]) => void
}

interface ActiveLongAction {
  name: string
  phase: LongActionPhase
  clips: LongActionClips
  /** Mid-loop budget left. The start and end clips do not count. */
  remainingMs: number
  startedAt: number
  /** Cancels the running mid-loop timer. Undefined while paused or before mid. */
  timer?: () => void
}

// The package compiles without DOM or Node types. Both runtimes expose timers
// on the global scope, so declare the two functions this module uses.
declare function setTimeout(callback: () => void, delayMs: number): unknown
declare function clearTimeout(handle: unknown): void

const systemClock: AnimationClockPort = {
  now: () => Date.now(),
  setTimer: (delayMs, callback) => {
    const handle = setTimeout(callback, Math.max(0, delayMs))
    return () => clearTimeout(handle)
  },
}

interface InternalState {
  base: BaseChain
  current: NormalizedClip | null
  oneShot: NormalizedClip | null
  stateClip: NormalizedClip | null
  longAction: ActiveLongAction | null
  paused: boolean
  speaking: boolean
  thinking: boolean
  waiting: boolean
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
  private readonly clock: AnimationClockPort
  private readonly onCommands?: (commands: AnimationCommand[]) => void
  private state: InternalState

  constructor(pack: LoadedPack, options: AnimationControllerOptions = {}) {
    this.pack = pack
    this.picker = new WeightedPicker(options.random)
    this.fallbackFadeMs = options.defaultFadeMs ?? defaultFadeMs
    this.clock = options.clock ?? systemClock
    this.onCommands = options.onCommands
    this.state = {
      base: 'idle',
      current: null,
      oneShot: null,
      stateClip: null,
      longAction: null,
      paused: false,
      speaking: false,
      thinking: false,
      waiting: false,
      lastByChain: {},
    }
  }

  get snapshot(): AnimationPlaybackSnapshot {
    return {
      base: this.state.base,
      currentClipId: this.state.current?.id ?? null,
      oneShotClipId: this.state.oneShot?.id ?? null,
      stateClipId: this.state.stateClip?.id ?? null,
      longActionName: this.state.longAction?.name ?? null,
      longActionPhase: this.state.longAction?.phase ?? null,
      paused: this.state.paused,
      waiting: this.state.waiting,
    }
  }

  dispatch(event: AnimationEvent): AnimationCommand[] {
    switch (event.type) {
      case 'idle':
        this.state.waiting = false
        this.cancelLongAction()
        return this.enterBase('idle')
      case 'speaking':
        return this.handleSpeaking(event.value)
      case 'thinking':
        return this.handleThinking(event.value)
      case 'emotion':
        this.cancelLongAction()
        return this.playOneShot(chooseTier(this.pack, event.emotion, event.intensity ?? 1))
      case 'action':
        return this.handleAction(event.name, event.durationMs)
      case 'longActionStop':
        return this.stopLongAction(event.mode ?? 'end')
      case 'expression':
        this.cancelLongAction()
        return this.playOneShot(this.pack.expressions[event.name] ?? [])
      case 'click':
        this.cancelLongAction()
        return this.playOneShot(chooseClick(this.pack, event.area))
      case 'playClip':
        this.cancelLongAction()
        return this.playSpecifiedClip(event.clipId)
      case 'setState':
        this.cancelLongAction()
        return this.setStateClip(event.clipId)
      case 'clearState':
        this.cancelLongAction()
        return this.clearStateClip()
      case 'paused':
        return this.handlePaused(event.value)
      case 'waiting':
        return this.handleWaiting(event.value)
    }
  }

  clipEnded(clipId: string): AnimationCommand[] {
    if (this.state.paused)
      return []

    const longAction = this.state.longAction
    if (longAction) {
      if (longAction.phase === 'start' && longAction.clips.start?.id === clipId)
        return this.beginLongMid()

      if (longAction.phase === 'mid' && longAction.clips.mid.id === clipId) {
        // The timer owns the budget. Mid keeps looping until it fires.
        return this.playLongMid()
      }

      if (longAction.phase === 'end' && longAction.clips.end?.id === clipId)
        return this.finishLongAction()

      // An ended event from a slot that the long action replaced.
      return []
    }

    if (this.state.oneShot?.id === clipId) {
      this.state.oneShot = null
      return this.resumeBase()
    }

    if (this.state.current?.id === clipId) {
      if (this.state.stateClip?.id === clipId)
        return this.playStateClip()
      return this.playFromChain(this.state.base)
    }

    return []
  }

  /** Stops every pending long action timer. Call it when the host unmounts. */
  dispose(): void {
    this.clearLongTimer()
    this.state.longAction = null
  }

  private handleAction(name: string, durationMs?: number): AnimationCommand[] {
    this.cancelLongAction()

    const clips = this.pack.longActions[name]
    if (!clips)
      return this.playOneShot(this.pack.actions[name] ?? [])

    return this.startLongAction(name, clips, durationMs)
  }

  private startLongAction(name: string, clips: LongActionClips, durationMs?: number): AnimationCommand[] {
    const requested = durationMs && durationMs > 0
      ? durationMs
      : clips.defaultDurationMs ?? clips.mid.durationMs ?? 0

    this.state.longAction = {
      name,
      phase: 'start',
      clips,
      remainingMs: Math.max(0, requested),
      startedAt: 0,
    }
    this.state.oneShot = null

    if (clips.start)
      return this.playLongClip('start', clips.start)

    return this.beginLongMid()
  }

  /** Enters the mid loop and starts the duration timer. */
  private beginLongMid(): AnimationCommand[] {
    const longAction = this.state.longAction
    if (!longAction)
      return []

    const commands = this.playLongClip('mid', longAction.clips.mid)
    this.startLongTimer()
    return commands
  }

  private startLongTimer(): void {
    const longAction = this.state.longAction
    if (!longAction || longAction.timer || longAction.phase !== 'mid')
      return

    longAction.startedAt = this.clock.now()
    longAction.timer = this.clock.setTimer(longAction.remainingMs, () => {
      longAction.timer = undefined
      if (this.state.longAction !== longAction)
        return

      // The timer cuts the current mid clip and inserts the end clip.
      this.emitCommands(this.playLongEnd())
    })
  }

  private clearLongTimer(): void {
    const longAction = this.state.longAction
    if (!longAction?.timer)
      return

    longAction.timer()
    longAction.timer = undefined
  }

  /** Keeps the unused budget so a pause does not extend the requested duration. */
  private freezeLongTimer(): void {
    const longAction = this.state.longAction
    if (!longAction?.timer)
      return

    longAction.remainingMs = Math.max(0, longAction.remainingMs - (this.clock.now() - longAction.startedAt))
    this.clearLongTimer()
  }

  private playLongClip(phase: LongActionPhase, clip: NormalizedClip): AnimationCommand[] {
    if (this.state.longAction)
      this.state.longAction.phase = phase

    this.state.oneShot = clip
    this.state.current = clip
    return [{ type: 'play', clip, fadeMs: this.fadeFor(clip) }]
  }

  private playLongMid(): AnimationCommand[] {
    const longAction = this.state.longAction
    if (!longAction)
      return []

    return this.playLongClip('mid', longAction.clips.mid)
  }

  private playLongEnd(): AnimationCommand[] {
    const longAction = this.state.longAction
    if (!longAction)
      return []

    this.clearLongTimer()

    if (longAction.clips.end)
      return this.playLongClip('end', longAction.clips.end)

    return this.finishLongAction()
  }

  private finishLongAction(): AnimationCommand[] {
    this.clearLongTimer()
    this.state.longAction = null
    this.state.oneShot = null
    return this.resumeBase()
  }

  /**
   * Drops the long action at once. Used by intents that must take over, such as
   * speech or a click. The end clip does not play on this path.
   */
  private cancelLongAction(): void {
    if (!this.state.longAction)
      return

    this.clearLongTimer()
    this.state.longAction = null
    this.state.oneShot = null
  }

  private stopLongAction(mode: LongActionStopMode): AnimationCommand[] {
    const longAction = this.state.longAction
    if (!longAction)
      return []

    this.clearLongTimer()

    if (mode === 'end')
      return this.playLongEnd()

    this.state.longAction = null
    this.state.oneShot = null
    return this.resumeBase()
  }

  private emitCommands(commands: AnimationCommand[]): void {
    if (commands.length)
      this.onCommands?.(commands)
  }

  private handleSpeaking(value: boolean): AnimationCommand[] {
    if (value) {
      // A long action already plays its exit clip. Let it finish so the
      // session start stays smooth instead of cutting the end clip.
      if (this.state.longAction && this.state.longAction.phase === 'end') {
        this.state.speaking = true
        return []
      }

      this.cancelLongAction()
      this.state.speaking = true
      this.state.oneShot = null
      return this.enterBase('talk')
    }

    this.state.speaking = false
    return this.enterBase(this.state.waiting ? 'waiting' : 'idle')
  }

  private handleThinking(value: boolean): AnimationCommand[] {
    this.state.thinking = value

    if (value && !this.state.speaking) {
      if (this.state.longAction && this.state.longAction.phase === 'end')
        return []

      this.cancelLongAction()
      this.state.oneShot = null
      return this.enterBase('thinking')
    }

    if (!value)
      return this.enterBase(this.state.speaking ? 'talk' : this.state.waiting ? 'waiting' : 'idle')

    return []
  }

  /**
   * Enters or leaves the session wait loop.
   *
   * A running long action keeps its own exit path. The session machine
   * requests `longActionStop: end` first, and the wait chain starts when the
   * end clip finishes. An active one-shot also finishes before the switch.
   */
  private handleWaiting(value: boolean): AnimationCommand[] {
    if (this.state.waiting === value)
      return []

    this.state.waiting = value

    if (value) {
      if (this.state.longAction || this.state.oneShot)
        return []
      return this.enterBase('waiting')
    }

    if (this.state.base === 'waiting')
      return this.enterBase('idle')

    return []
  }

  private handlePaused(value: boolean): AnimationCommand[] {
    if (this.state.paused === value)
      return []

    this.state.paused = value
    if (this.state.longAction) {
      if (value)
        this.freezeLongTimer()
      else
        this.startLongTimer()
    }

    return [{ type: value ? 'pause' : 'resume' }]
  }

  private enterBase(chain: BaseChain): AnimationCommand[] {
    const chainChanged = this.state.base !== chain
    this.state.base = chain

    if (chain === 'idle' && this.state.stateClip) {
      if (!chainChanged && !this.state.oneShot && this.state.current?.id === this.state.stateClip.id)
        return []

      this.state.oneShot = null
      return this.playStateClip()
    }

    if (!chainChanged && !this.state.oneShot && this.state.current)
      return []

    this.state.oneShot = null
    return this.playFromChain(chain)
  }

  private resumeBase(): AnimationCommand[] {
    if (this.state.speaking) {
      this.state.base = 'talk'
      return this.playFromChain('talk')
    }

    if (this.state.thinking) {
      this.state.base = 'thinking'
      return this.playFromChain('thinking')
    }

    if (this.state.waiting) {
      this.state.base = 'waiting'
      if (this.state.stateClip)
        return this.playStateClip()
      return this.playFromChain('waiting')
    }

    this.state.base = 'idle'
    if (this.state.stateClip)
      return this.playStateClip()
    return this.playFromChain('idle')
  }

  private findClip(clipId: string): NormalizedClip | undefined {
    return this.pack.allClips.find(clip => clip.id === clipId)
  }

  private playSpecifiedClip(clipId: string): AnimationCommand[] {
    const source = this.findClip(clipId)
    if (!source)
      return []

    const clip = source.loop ? { ...source, loop: false } : source
    this.state.oneShot = clip
    this.state.current = clip
    return [{ type: 'play', clip, fadeMs: this.fadeFor(clip) }]
  }

  private setStateClip(clipId: string): AnimationCommand[] {
    const source = this.findClip(clipId)
    if (!source)
      return []

    const clip = source.loop ? source : { ...source, loop: true }
    this.state.stateClip = clip
    this.state.base = 'idle'
    this.state.oneShot = null

    if (this.state.speaking || this.state.thinking)
      return []
    if (this.state.current?.id === clip.id)
      return []

    this.state.current = clip
    return [{ type: 'play', clip, fadeMs: this.fadeFor(clip) }]
  }

  private clearStateClip(): AnimationCommand[] {
    if (!this.state.stateClip)
      return []

    this.state.lastByChain.idle = this.state.stateClip.id
    this.state.stateClip = null
    this.state.oneShot = null

    if (this.state.speaking) {
      this.state.base = 'talk'
      return []
    }

    if (this.state.thinking) {
      this.state.base = 'thinking'
      return []
    }

    this.state.current = null
    return this.enterBase('idle')
  }

  private playStateClip(): AnimationCommand[] {
    const clip = this.state.stateClip
    if (!clip)
      return []

    this.state.current = clip
    return [{ type: 'play', clip, fadeMs: this.fadeFor(clip) }]
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
