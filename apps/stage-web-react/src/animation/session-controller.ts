import type {
  SessionEvent,
  SessionInteractionType,
  SessionPhase,
  SessionTransition,
} from '@proj-airi/character-animation'

import { SessionStateMachine } from '@proj-airi/character-animation'
import { useSyncExternalStore } from 'react'

import { animationLog } from './animation-log'

type TransitionListener = (transition: SessionTransition) => void

/**
 * Host-side wrapper around `SessionStateMachine`.
 *
 * It owns the single timeout timer and the visibility catch-up. Components call
 * `notifyInteraction` for user input and subscribe to transitions. The machine
 * stays pure, so the same logic is testable without a browser.
 */
class AnimationSessionController {
  private machine = new SessionStateMachine()
  private transitionListeners = new Set<TransitionListener>()
  private phaseListeners = new Set<() => void>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor() {
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', this.handleVisibilityChange)
  }

  get phase(): SessionPhase {
    return this.machine.snapshot.phase
  }

  get snapshot() {
    return this.machine.snapshot
  }

  sequenceBudgetMs(): number {
    return this.machine.sequenceBudgetMs()
  }

  notifyInteraction(type: SessionInteractionType): void {
    this.handle({ type })
  }

  notifyReplyStart(): void {
    this.handle({ type: 'reply-start' })
  }

  notifyReplyEnd(): void {
    this.handle({ type: 'reply-end' })
  }

  notifyEntered(): void {
    this.handle({ type: 'entered' })
  }

  reset(): void {
    const transition = this.machine.handle({ type: 'reset' })
    if (transition)
      this.emit(transition)
    this.armTimer()
  }

  handle(event: SessionEvent): SessionTransition | null {
    const transition = this.machine.handle(event)
    if (transition) {
      animationLog.write('session', `${transition.from} -> ${transition.to}`, {
        event: transition.event,
        effects: transition.effects,
        epoch: transition.epoch,
      })
      this.emit(transition)
    }

    this.armTimer()
    return transition
  }

  subscribe(listener: TransitionListener): () => void {
    this.transitionListeners.add(listener)
    return () => {
      this.transitionListeners.delete(listener)
    }
  }

  subscribePhase = (listener: () => void): (() => void) => {
    this.phaseListeners.add(listener)
    return () => {
      this.phaseListeners.delete(listener)
    }
  }

  getPhase = (): SessionPhase => this.phase

  private emit(transition: SessionTransition): void {
    for (const listener of this.transitionListeners)
      listener(transition)
    if (transition.from !== transition.to) {
      for (const listener of this.phaseListeners)
        listener()
    }
  }

  private armTimer(): void {
    if (this.timer !== null)
      clearTimeout(this.timer)
    this.timer = null

    if (this.machine.snapshot.phase === 'ambient')
      return

    const remaining = this.machine.remainingMs()
    this.timer = setTimeout(() => {
      this.timer = null
      const transition = this.machine.handle({ type: 'timeout' })
      if (transition)
        this.emit(transition)
      this.armTimer()
    }, Math.max(500, remaining))
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible')
      return

    const transition = this.machine.resume()
    if (transition) {
      animationLog.write('session', 'resume: session expired while away', {
        effects: transition.effects,
      })
      this.emit(transition)
    }
    this.armTimer()
  }
}

export const sessionController = new AnimationSessionController()

/** Subscribes a component to the session phase. */
export function useSessionPhase(): SessionPhase {
  return useSyncExternalStore(sessionController.subscribePhase, sessionController.getPhase, sessionController.getPhase)
}
