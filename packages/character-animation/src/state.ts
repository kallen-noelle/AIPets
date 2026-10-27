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
  NormalizedClip,
} from './types'

import { WeightedPicker } from './picker'

export interface AnimationControllerOptions {
  random?: RandomSource
  defaultFadeMs?: number
  clock?: AnimationClockPort
}

interface ActiveLongAction {
  name: string
  phase: LongActionPhase
  clips: LongActionClips
  /** Action budget left. It counts from the first frame, start included. */
  remainingMs: number
  startedAt: number
  /** Cancels the running budget timer. Undefined while paused or after it fires. */
  timer?: () => void
  /** An interrupt waits for the playing clip to finish. */
  stopRequested: boolean
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
  /** Request that waits for the finite clip that already plays. */
  pendingEvent: AnimationEvent | null
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
  private state: InternalState

  constructor(pack: LoadedPack, options: AnimationControllerOptions = {}) {
    this.pack = pack
    this.picker = new WeightedPicker(options.random)
    this.fallbackFadeMs = options.defaultFadeMs ?? defaultFadeMs
    this.clock = options.clock ?? systemClock
    this.state = {
      base: 'idle',
      current: null,
      oneShot: null,
      stateClip: null,
      longAction: null,
      pendingEvent: null,
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
        if (this.requestLongStop(event) || this.deferForPlayingClip(event))
          return []
        return this.enterBase('idle')
      case 'speaking':
        return this.handleSpeaking(event.value)
      case 'thinking':
        return this.handleThinking(event.value)
      case 'emotion':
        if (this.requestLongStop(event) || this.deferForPlayingClip(event))
          return []
        return this.playOneShot(chooseTier(this.pack, event.emotion, event.intensity ?? 1))
      case 'action':
        return this.handleAction(event.name, event.durationMs)
      case 'longActionStop':
        this.requestLongStop(null)
        return []
      case 'expression':
        if (this.requestLongStop(event) || this.deferForPlayingClip(event))
          return []
        return this.playOneShot(this.pack.expressions[event.name] ?? [])
      case 'click':
        if (this.requestLongStop(event) || this.deferForPlayingClip(event))
          return []
        return this.playOneShot(chooseClick(this.pack, event.area))
      case 'playClip':
        if (this.requestLongStop(event) || this.deferForPlayingClip(event))
          return []
        return this.playSpecifiedClip(event.clipId)
      case 'setState':
        if (this.requestLongStop(event) || this.deferForPlayingClip(event))
          return []
        return this.setStateClip(event.clipId)
      case 'clearState':
        if (this.requestLongStop(event) || this.deferForPlayingClip(event))
          return []
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
      if (longAction.phase === 'start' && longAction.clips.start?.id === clipId) {
        // An interrupt waits for this clip. It never cuts the playing frame.
        if (longAction.stopRequested)
          return this.playLongEnd()
        return this.beginLongLoop()
      }

      if (longAction.phase === 'loop' && longAction.clips.loop.id === clipId) {
        if (longAction.stopRequested)
          return this.playLongEnd()

        // The timer owns the budget. Loop keeps repeating until it fires.
        return this.playLongLoop()
      }

      if (longAction.phase === 'end' && longAction.clips.end?.id === clipId)
        return this.finishLongAction()

      // An ended event from a slot that the long action replaced.
      return []
    }

    if (this.state.oneShot?.id === clipId) {
      this.state.oneShot = null
      this.state.current = null
      const pending = this.takePendingEvent()
      if (pending)
        return this.dispatch(pending)
      return this.resumeBase()
    }

    if (this.state.current?.id === clipId) {
      this.state.current = null
      const pending = this.takePendingEvent()
      if (pending)
        return this.dispatch(pending)

      if (this.state.speaking || this.state.thinking || this.state.waiting)
        return this.resumeBase()

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
    this.state.pendingEvent = null
  }

  private handleAction(name: string, durationMs?: number): AnimationCommand[] {
    const request: AnimationEvent = { type: 'action', name, durationMs }
    if (this.requestLongStop(request) || this.deferForPlayingClip(request))
      return []

    const clips = this.pack.longActions[name]
    if (!clips)
      return this.playOneShot(this.pack.actions[name] ?? [])

    return this.startLongAction(name, clips, durationMs)
  }

  private startLongAction(name: string, clips: LongActionClips, durationMs?: number): AnimationCommand[] {
    const requested = durationMs && durationMs > 0
      ? durationMs
      : clips.defaultDurationMs ?? clips.loop.durationMs ?? 0

    this.state.longAction = {
      name,
      phase: 'start',
      clips,
      remainingMs: Math.max(0, requested),
      startedAt: 0,
      stopRequested: false,
    }
    this.state.oneShot = null

    // The budget counts from the first frame of the action. The start clip
    // spends part of it before the loop begins.
    this.startLongTimer()

    if (clips.start)
      return this.playLongClip('start', clips.start)

    return this.beginLongLoop()
  }

  /** Enters the loop. The timer already runs, so this only plays the clip. */
  private beginLongLoop(): AnimationCommand[] {
    const longAction = this.state.longAction
    if (!longAction)
      return []

    const commands = this.playLongClip('loop', longAction.clips.loop)
    this.startLongTimer()
    return commands
  }

  private startLongTimer(): void {
    const longAction = this.state.longAction
    if (!longAction || longAction.timer || longAction.stopRequested)
      return

    longAction.startedAt = this.clock.now()
    longAction.timer = this.clock.setTimer(longAction.remainingMs, () => {
      longAction.timer = undefined
      if (this.state.longAction !== longAction)
        return

      // The budget is spent. The exit waits for the running clip to end.
      longAction.stopRequested = true
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

  private playLongClip(phase: LongActionPhase, clip: NormalizedClip, fadeMs?: number): AnimationCommand[] {
    if (this.state.longAction)
      this.state.longAction.phase = phase

    this.state.oneShot = clip
    this.state.current = clip
    return [{ type: 'play', clip, fadeMs: fadeMs ?? this.fadeFor(clip) }]
  }

  private playLongLoop(): AnimationCommand[] {
    const longAction = this.state.longAction
    if (!longAction)
      return []

    // A repeated loop clip must not crossfade into itself. The seam is a cut.
    return this.playLongClip('loop', longAction.clips.loop, 0)
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
    this.state.current = null

    const pending = this.takePendingEvent()
    if (pending)
      return this.dispatch(pending)

    return this.resumeBase()
  }

  /**
   * Marks the long action to exit after the clip that already plays.
   *
   * The playing clip always finishes. The end clip follows it, and then the
   * pending event applies. This keeps an interrupt from cutting a frame.
   */
  private requestLongStop(event: AnimationEvent | null): boolean {
    const longAction = this.state.longAction
    if (!longAction)
      return false

    longAction.stopRequested = true
    if (event)
      this.state.pendingEvent = event

    // The duration timer must not cut the clip that already plays.
    this.clearLongTimer()
    return true
  }

  /**
   * Holds a request until the clip that already plays reaches its end.
   *
   * Only a finite clip blocks a switch. A looping clip has no end, so it can
   * crossfade at any time.
   */
  private deferForPlayingClip(event: AnimationEvent): boolean {
    if (!this.hasFiniteClipPlaying())
      return false

    this.state.pendingEvent = event
    return true
  }

  private hasFiniteClipPlaying(): boolean {
    const current = this.state.current
    return !!current && !current.loop
  }

  private takePendingEvent(): AnimationEvent | null {
    const pending = this.state.pendingEvent
    this.state.pendingEvent = null
    return pending
  }

  private handleSpeaking(value: boolean): AnimationCommand[] {
    if (this.state.speaking === value)
      return []

    this.state.speaking = value

    // A long action leaves only after the clip that already plays.
    if (this.requestLongStop(null))
      return []

    // A finite one-shot also runs to its end. The flag picks the chain after it.
    if (this.hasFiniteClipPlaying())
      return []

    if (value) {
      this.state.oneShot = null
      return this.enterBase('talk')
    }

    return this.enterBase(this.state.waiting ? 'waiting' : 'idle')
  }

  private handleThinking(value: boolean): AnimationCommand[] {
    if (this.state.thinking === value)
      return []

    this.state.thinking = value

    if (this.requestLongStop(null))
      return []

    if (this.hasFiniteClipPlaying())
      return []

    if (value && !this.state.speaking) {
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
   * requests `longActionStop` first, and the wait chain starts when the end
   * clip finishes. An active one-shot also finishes before the switch.
   */
  private handleWaiting(value: boolean): AnimationCommand[] {
    if (this.state.waiting === value)
      return []

    this.state.waiting = value

    // A long action and a finite one-shot both finish their clip first.
    if (this.state.longAction || this.hasFiniteClipPlaying())
      return []

    if (value) {
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
