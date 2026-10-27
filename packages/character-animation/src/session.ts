export type SessionPhase = 'ambient' | 'entering' | 'waiting' | 'listening' | 'thinking' | 'talking'

export type SessionInteractionType = 'click' | 'submit' | 'voice-start' | 'voice-end' | 'input'

export type SessionEventType
  = | SessionInteractionType
    | 'entered'
    | 'reply-start'
    | 'reply-end'
    | 'timeout'
    | 'reset'

export interface SessionEvent {
  type: SessionEventType
}

/** Host actions that follow a session transition. */
export type SessionEffect
  = | 'stop-long-action'
    | 'enter-waiting'
    | 'enter-listening'
    | 'enter-thinking'
    | 'enter-talking'
    | 'enter-ambient'
    | 'reorder-plan'

export interface SessionTransition {
  from: SessionPhase
  to: SessionPhase
  event: SessionEventType
  effects: SessionEffect[]
  /** Incremented on every user interaction and on timeout. */
  epoch: number
  at: number
}

export interface SessionSnapshot {
  phase: SessionPhase
  epoch: number
  lastInteractionAt: number
  idleTimeoutMs: number
  pendingAfterEnter: 'waiting' | 'thinking'
}

export interface SessionStateMachineOptions {
  /** Starts from the last user interaction, not from the reply end. */
  idleTimeoutMs?: number
  /** Time kept free at the end of the window for the next user turn. */
  reserveMs?: number
  now?: () => number
}

export const defaultSessionIdleTimeoutMs = 90_000
export const defaultSessionReserveMs = 20_000

/**
 * Owns the ambient to session lifecycle.
 *
 * The machine is pure and synchronous. The host arms one timer from
 * `remainingMs()` and calls `handle({ type: 'timeout' })`. Every user
 * interaction bumps `epoch`, so a callback from an older timer can be dropped
 * by comparing epochs.
 */
export class SessionStateMachine {
  private phase: SessionPhase = 'ambient'
  private epoch = 0
  private lastInteractionAt: number
  private pendingAfterEnter: 'waiting' | 'thinking' = 'waiting'
  private readonly clock: () => number
  private readonly timeoutMs: number
  private readonly reserve: number

  constructor(options: SessionStateMachineOptions = {}) {
    this.clock = options.now ?? (() => Date.now())
    this.timeoutMs = Math.max(0, options.idleTimeoutMs ?? defaultSessionIdleTimeoutMs)
    this.reserve = Math.max(0, options.reserveMs ?? defaultSessionReserveMs)
    this.lastInteractionAt = this.clock()
  }

  get snapshot(): SessionSnapshot {
    return {
      phase: this.phase,
      epoch: this.epoch,
      lastInteractionAt: this.lastInteractionAt,
      idleTimeoutMs: this.timeoutMs,
      pendingAfterEnter: this.pendingAfterEnter,
    }
  }

  get idleTimeoutMs(): number {
    return this.timeoutMs
  }

  /** Time left before the session returns to ambient. Zero while ambient. */
  remainingMs(now?: number): number {
    if (this.phase === 'ambient')
      return 0

    const at = now ?? this.clock()
    return Math.max(0, this.timeoutMs - (at - this.lastInteractionAt))
  }

  /** Budget for one waiting sequence, for example 70 seconds by default. */
  sequenceBudgetMs(): number {
    return Math.max(0, this.timeoutMs - this.reserve)
  }

  handle(event: SessionEvent, now?: number): SessionTransition | null {
    const at = now ?? this.clock()

    if (event.type === 'reset') {
      if (this.phase === 'ambient')
        return null
      const from = this.phase
      this.phase = 'ambient'
      this.epoch += 1
      return this.transition(from, 'ambient', event.type, ['enter-ambient'], at)
    }

    if (event.type === 'timeout') {
      if (this.phase === 'ambient')
        return null
      if (at - this.lastInteractionAt < this.timeoutMs)
        return null
      return this.timeout(at)
    }

    if (event.type === 'entered') {
      if (this.phase !== 'entering')
        return null

      return this.move(
        this.phase,
        this.pendingAfterEnter === 'thinking' ? 'thinking' : 'waiting',
        event.type,
        this.pendingAfterEnter === 'thinking' ? ['enter-thinking'] : ['enter-waiting'],
        at,
      )
    }

    if (event.type === 'reply-start') {
      if (this.phase !== 'thinking' && this.phase !== 'waiting')
        return null
      return this.move(this.phase, 'talking', event.type, ['enter-talking'], at)
    }

    if (event.type === 'reply-end') {
      if (this.phase !== 'thinking' && this.phase !== 'talking')
        return null
      return this.move(this.phase, 'waiting', event.type, ['enter-waiting'], at)
    }

    return this.handleInteraction(event.type, at)
  }

  /**
   * Catches up after the app wakes from sleep. No timer runs while suspended,
   * so the elapsed time alone decides whether the session expired.
   */
  resume(now?: number): SessionTransition | null {
    const at = now ?? this.clock()
    if (this.phase === 'ambient')
      return null
    if (at - this.lastInteractionAt < this.timeoutMs)
      return null
    return this.timeout(at)
  }

  private handleInteraction(type: SessionInteractionType, at: number): SessionTransition {
    this.epoch += 1
    this.lastInteractionAt = at
    const from = this.phase

    if (from === 'ambient') {
      this.pendingAfterEnter = type === 'submit' ? 'thinking' : 'waiting'
      this.phase = 'entering'
      return this.transition(from, 'entering', type, ['stop-long-action'], at)
    }

    if (from === 'entering') {
      this.pendingAfterEnter = type === 'submit' ? 'thinking' : this.pendingAfterEnter === 'thinking' ? 'thinking' : 'waiting'
      return this.transition(from, from, type, [], at)
    }

    if (type === 'submit') {
      this.pendingAfterEnter = 'thinking'
      if (from !== 'thinking')
        return this.move(from, 'thinking', type, ['enter-thinking'], at)
      return this.transition(from, from, type, [], at)
    }

    if (from === 'waiting') {
      if (type === 'input' || type === 'voice-start')
        return this.move(from, 'listening', type, ['enter-listening'], at)
      return this.transition(from, from, type, [], at)
    }

    if (from === 'listening' && type === 'voice-end')
      return this.move(from, 'waiting', type, ['enter-waiting'], at)

    return this.transition(from, from, type, [], at)
  }

  private timeout(at: number): SessionTransition {
    const from = this.phase
    this.phase = 'ambient'
    this.epoch += 1
    return this.transition(from, 'ambient', 'timeout', ['stop-long-action', 'enter-ambient', 'reorder-plan'], at)
  }

  private move(from: SessionPhase, to: SessionPhase, event: SessionEventType, effects: SessionEffect[], at: number): SessionTransition {
    this.phase = to
    return this.transition(from, to, event, effects, at)
  }

  private transition(from: SessionPhase, to: SessionPhase, event: SessionEventType, effects: SessionEffect[], at: number): SessionTransition {
    return {
      from,
      to,
      event,
      effects,
      epoch: this.epoch,
      at,
    }
  }
}
