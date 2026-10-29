import type {
  ActionSequence,
  AnimationEvent,
  PerformancePlan,
  SessionEvent,
} from '@proj-aipets/character-animation'

import type { DirectorContext, DirectorTimelineEvent } from '../animation/director-bus'

import { directorBus } from '../animation/director-bus'
import { sessionController } from '../animation/session-controller'
import { getDesktopBridge } from './bridge'

/**
 * Signals one renderer sends to the desktop pet window.
 *
 * The chat and the pet run in different windows, so each has its own
 * `directorBus` and `sessionController`. These messages keep the pet animated
 * while the user chats in the chat window.
 */
type PetRelayMessage
  = | { kind: 'plan', plan: PerformancePlan }
    | { kind: 'event', event: AnimationEvent }
    | { kind: 'bubble', text: string | null }
    | { kind: 'timeline', timeline: DirectorTimelineEvent }
    | { kind: 'sequence', sequence: ActionSequence }
    | { kind: 'session', event: SessionEvent }
    | { kind: 'context', context: DirectorContext }
    | { kind: 'context-request' }

/**
 * Sends the pet window director context to the other windows.
 *
 * The chat window runs in its own renderer, so its `directorBus` has no
 * catalog and no persona. Without the context, `buildDirectorRequest` returns
 * null and the reply has no plan block. The stage publishes this context after
 * every change that affects the plan.
 */
export function publishDirectorContext(): void {
  const bridge = getDesktopBridge()
  if (!bridge)
    return

  bridge.sendPetEvent({ kind: 'context', context: directorBus.getContext() })
}

/** Keeps the chat window director context current. */
export function receiveDirectorContext(): () => void {
  const bridge = getDesktopBridge()
  if (!bridge)
    return () => {}

  return bridge.onPetEvent((payload) => {
    const message = payload as PetRelayMessage
    if (message.kind === 'context')
      directorBus.setContext(message.context)
  })
}

/** Forwards the animation signals of the chat window to the pet window. */
export function relayDirectorToPetWindow(): () => void {
  const bridge = getDesktopBridge()
  if (!bridge)
    return () => {}

  // The pet window may already be open, so ask it for its current context.
  bridge.sendPetEvent({ kind: 'context-request' })

  const unsubscribers = [
    directorBus.subscribePlans(plan => bridge.sendPetEvent({ kind: 'plan', plan })),
    directorBus.subscribeEvents(event => bridge.sendPetEvent({ kind: 'event', event })),
    directorBus.subscribeBubble(text => bridge.sendPetEvent({ kind: 'bubble', text })),
    directorBus.subscribeTimeline(timeline => bridge.sendPetEvent({ kind: 'timeline', timeline })),
    directorBus.subscribeSequences(sequence => bridge.sendPetEvent({ kind: 'sequence', sequence })),
    sessionController.subscribe(transition => bridge.sendPetEvent({ kind: 'session', event: transition.event })),
  ]

  return () => {
    for (const unsubscribe of unsubscribers)
      unsubscribe()
  }
}

/** Replays the signals that the chat window forwarded. */
export function receivePetRelay(): () => void {
  const bridge = getDesktopBridge()
  if (!bridge)
    return () => {}

  return bridge.onPetEvent((payload) => {
    const message = payload as PetRelayMessage

    switch (message.kind) {
      case 'plan':
        directorBus.emitPlan(message.plan)
        break
      case 'event':
        directorBus.emitEvent(message.event)
        break
      case 'bubble':
        directorBus.emitBubble(message.text)
        break
      case 'timeline':
        directorBus.emitTimeline(message.timeline)
        break
      case 'sequence':
        directorBus.emitSequence(message.sequence)
        break
      case 'session':
        sessionController.handle(message.event)
        break
      case 'context-request':
        publishDirectorContext()
        break
    }
  })
}
