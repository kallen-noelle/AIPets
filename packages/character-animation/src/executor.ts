import type { CharacterCatalog, ClipDescriptor } from './catalog'
import type { PerformanceCue, PerformancePlan, PlanAnchor } from './plan'
import type { AnimationClockPort } from './types'

import { comparePlanAnchors } from './plan'

export type PlanExecutorDropReason
  = | 'unknown-clip'
    | 'duplicate'
    | 'clip-cooldown'
    | 'tag-cooldown'
    | 'queue-full'
    | 'expired'

export interface ExecutedCue {
  clipId: string
  intensity: number
  anchor: PlanAnchor
  reason?: string
}

export interface PlanExecutorDrop {
  clipId: string
  reason: PlanExecutorDropReason
}

export interface PlanExecutionResult {
  cues: ExecutedCue[]
  drops: PlanExecutorDrop[]
}

export type PlanTimelineEvent
  = | { type: 'replyStart' }
    | { type: 'sentence', index: number }
    | { type: 'speechEnd' }

export interface PerformancePlanExecutorOptions {
  clock: AnimationClockPort
  catalog: CharacterCatalog
  clipCooldownMs?: number
  tagCooldownMs?: number
  maxQueue?: number
  queueTtlMs?: number
  onCue?: (cue: ExecutedCue) => void
}

interface PendingCue {
  cue: PerformanceCue
  expiresAt: number
}

function anchorKey(anchor: PlanAnchor): string {
  switch (anchor.type) {
    case 'replyStart':
      return 'replyStart'
    case 'sentence':
      return `sentence:${anchor.index}`
    case 'afterSpeech':
      return 'afterSpeech'
    case 'silence':
      return `silence:${anchor.seconds}`
  }
}

/**
 * Schedules cues from a performance plan against speech and reply anchors.
 *
 * The executor owns timing, cooldowns, and the one-slot queue. It does not own
 * clip playback. Each accepted cue is emitted to the caller, which forwards an
 * explicit clip command to the animation controller.
 *
 * Call the timeline methods in this order:
 *
 * replyStart -> sentence(1..n) -> speechEnd
 *
 * A plan can arrive after `replyStart`. Late cues still run at their own anchor
 * or are dropped as stale. The executor never rewinds playback.
 */
export class PerformancePlanExecutor {
  private readonly clock: AnimationClockPort
  private readonly descriptors: Map<string, ClipDescriptor>
  private readonly clipCooldownMs: number
  private readonly tagCooldownMs: number
  private readonly maxQueue: number
  private readonly queueTtlMs: number
  private readonly onCue?: (cue: ExecutedCue) => void

  private plan: PerformancePlan | null = null
  private executedKeys = new Set<string>()
  private lastPlayedAt = new Map<string, number>()
  private lastTagPlayedAt = new Map<string, number>()
  private pending: PendingCue[] = []
  private held: ExecutedCue[] = []
  private activeClipId: string | null = null
  private activeCue: PerformanceCue | null = null
  private paused = false
  private timerDisposers: Array<() => void> = []
  private emitted: ExecutedCue[] = []
  private dropped: PlanExecutorDrop[] = []

  constructor(options: PerformancePlanExecutorOptions) {
    this.clock = options.clock
    this.descriptors = new Map(options.catalog.clips.map(clip => [clip.id, clip]))
    this.clipCooldownMs = options.clipCooldownMs ?? 12_000
    this.tagCooldownMs = options.tagCooldownMs ?? 5_000
    this.maxQueue = options.maxQueue ?? 1
    this.queueTtlMs = options.queueTtlMs ?? 3_000
    this.onCue = options.onCue
  }

  start(plan: PerformancePlan): void {
    this.cancelTimers()
    this.plan = plan
    this.executedKeys.clear()
    this.pending = []
    this.held = []
    this.activeClipId = null
    this.activeCue = null
    this.emitted = []
    this.dropped = []
  }

  /**
   * Advances the plan to a timeline anchor and returns the cues that must play
   * now. Silence cues arm a timer and return nothing at this call.
   */
  handle(event: PlanTimelineEvent): PlanExecutionResult {
    this.emitted = []
    this.dropped = []
    if (!this.plan)
      return { cues: [], drops: [] }

    const cues = this.plan.cues.filter(cue => this.matches(event, cue.anchor))
    for (const cue of cues) {
      if (event.type === 'speechEnd' && cue.anchor.type === 'silence')
        this.scheduleSilence(cue)
      else
        this.execute(cue)
    }

    return { cues: this.emitted, drops: this.dropped }
  }

  /**
   * Clears the active slot after a one-shot ends and flushes one queued cue.
   */
  notifyClipEnded(clipId: string): PlanExecutionResult {
    this.emitted = []
    this.dropped = []
    if (this.activeClipId !== clipId)
      return { cues: [], drops: [] }

    this.activeClipId = null
    this.activeCue = null
    this.flushPending()
    return { cues: this.emitted, drops: this.dropped }
  }

  pause(): void {
    this.paused = true
  }

  resume(): PlanExecutionResult {
    this.paused = false
    this.emitted = []
    this.dropped = []

    const held = this.held
    this.held = []
    for (const cue of held)
      this.play(cue)
    this.flushPending()

    return { cues: this.emitted, drops: this.dropped }
  }

  /**
   * Drops the current plan and all pending cues. User clicks use this to take
   * control immediately.
   */
  interrupt(): void {
    this.cancelTimers()
    this.plan = null
    this.pending = []
    this.held = []
    this.activeClipId = null
    this.activeCue = null
    this.emitted = []
    this.dropped = []
  }

  private matches(event: PlanTimelineEvent, anchor: PlanAnchor): boolean {
    if (event.type === 'replyStart')
      return anchor.type === 'replyStart'
    if (event.type === 'sentence')
      return anchor.type === 'sentence' && anchor.index === event.index
    return anchor.type === 'afterSpeech' || anchor.type === 'silence'
  }

  private scheduleSilence(cue: PerformanceCue): void {
    if (cue.anchor.type !== 'silence')
      return

    const key = `${anchorKey(cue.anchor)}:${cue.clipId}`
    if (this.executedKeys.has(key))
      return

    const dispose = this.clock.setTimer(cue.anchor.seconds * 1000, () => {
      this.emitted = []
      this.dropped = []
      this.execute(cue)
      this.flushEmitted()
    })
    this.timerDisposers.push(dispose)
  }

  private execute(cue: PerformanceCue): void {
    const key = `${anchorKey(cue.anchor)}:${cue.clipId}`
    if (this.executedKeys.has(key)) {
      this.dropped.push({ clipId: cue.clipId, reason: 'duplicate' })
      return
    }

    const descriptor = this.descriptors.get(cue.clipId)
    if (!descriptor) {
      this.dropped.push({ clipId: cue.clipId, reason: 'unknown-clip' })
      return
    }

    const now = this.clock.now()
    const cooldown = this.cooldownReason(cue, now)
    if (cooldown) {
      this.dropped.push({ clipId: cue.clipId, reason: cooldown })
      return
    }

    if (this.activeClipId && this.activeCue) {
      // A cue for a later anchor replaces the current one-shot. Queueing it
      // would make it play after its anchor, and long clips often outlive the
      // next sentence. Same-anchor cues still use the one-slot queue.
      if (comparePlanAnchors(cue.anchor, this.activeCue.anchor) > 0) {
        this.executedKeys.add(key)
        this.play(cue)
        return
      }

      this.enqueue(cue, now)
      return
    }

    this.executedKeys.add(key)
    this.play(cue)
  }

  private cooldownReason(cue: PerformanceCue, now: number): PlanExecutorDropReason | null {
    const descriptor = this.descriptors.get(cue.clipId)
    if (!descriptor)
      return 'unknown-clip'

    const lastClipPlay = this.lastPlayedAt.get(cue.clipId)
    if (lastClipPlay !== undefined && now - lastClipPlay < this.clipCooldownMs)
      return 'clip-cooldown'

    // Only the primary tag participates in tag cooldown. Secondary tags are
    // often shared by a whole emotion group, so using every tag would block
    // unrelated clips that merely share "happy" or "click".
    const primaryTag = descriptor.tags[0]
    if (primaryTag) {
      const lastTagPlay = this.lastTagPlayedAt.get(primaryTag)
      if (lastTagPlay !== undefined && now - lastTagPlay < this.tagCooldownMs)
        return 'tag-cooldown'
    }

    return null
  }

  private enqueue(cue: PerformanceCue, now: number): void {
    if (this.pending.length >= this.maxQueue) {
      this.dropped.push({ clipId: cue.clipId, reason: 'queue-full' })
      return
    }

    this.pending.push({ cue, expiresAt: now + this.queueTtlMs })
  }

  private play(cue: PerformanceCue): void {
    if (this.paused) {
      this.held.push(cue)
      return
    }

    const descriptor = this.descriptors.get(cue.clipId)
    const now = this.clock.now()
    this.activeClipId = cue.clipId
    this.activeCue = cue
    this.lastPlayedAt.set(cue.clipId, now)
    const primaryTag = descriptor?.tags[0]
    if (primaryTag)
      this.lastTagPlayedAt.set(primaryTag, now)

    this.emitted.push({
      clipId: cue.clipId,
      intensity: cue.intensity,
      anchor: cue.anchor,
      ...(cue.reason ? { reason: cue.reason } : {}),
    })
  }

  private flushPending(): void {
    if (this.paused || this.activeClipId)
      return

    const now = this.clock.now()
    while (this.pending.length) {
      const next = this.pending.shift()
      if (!next)
        return

      if (next.expiresAt < now) {
        this.dropped.push({ clipId: next.cue.clipId, reason: 'expired' })
        continue
      }

      const cooldown = this.cooldownReason(next.cue, now)
      if (cooldown) {
        this.dropped.push({ clipId: next.cue.clipId, reason: cooldown })
        continue
      }

      const key = `${anchorKey(next.cue.anchor)}:${next.cue.clipId}`
      this.executedKeys.add(key)
      this.play(next.cue)
      return
    }
  }

  private flushEmitted(): void {
    if (!this.emitted.length || !this.onCue)
      return

    const cues = this.emitted
    this.emitted = []
    for (const cue of cues)
      this.onCue?.(cue)
  }

  private cancelTimers(): void {
    for (const dispose of this.timerDisposers)
      dispose()
    this.timerDisposers = []
  }
}
