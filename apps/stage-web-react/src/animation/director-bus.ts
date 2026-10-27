import type { ActionSequence, AnimationEvent, CharacterCatalog, PerformancePlan } from '@proj-airi/character-animation'

import type { DirectorLongAction } from './director'

export interface DirectorContext {
  active: boolean
  catalog: CharacterCatalog | null
  characterId: string | null
  characterName: string
  persona: string
  /** Long actions of the loaded pack, for waiting-phase sequences. */
  longActions: DirectorLongAction[]
}

export type DirectorPlanListener = (plan: PerformancePlan) => void
export type DirectorEventListener = (event: AnimationEvent) => void
export type DirectorBubbleListener = (text: string | null) => void

/**
 * Timeline marks the chat panel publishes for one reply. The stage uses them
 * to decide whether a late director plan still fits the reply.
 */
export interface DirectorTimelineEvent {
  type: 'reply-start' | 'sentence' | 'speech-end'
  /** Only present on sentence marks. */
  index?: number
  at: number
}

export type DirectorTimelineListener = (event: DirectorTimelineEvent) => void
export type DirectorSequenceListener = (sequence: ActionSequence) => void

const emptyContext: DirectorContext = {
  active: false,
  catalog: null,
  characterId: null,
  characterName: 'aipetdex',
  persona: '',
  longActions: [],
}

/**
 * Cross-component channel between the chat panel and the stage.
 *
 * The chat panel publishes plans and thinking events. The stage subscribes to
 * them when it is mounted. This avoids threading the animation controller
 * through the React tree and keeps `/chat` usable without a stage.
 */
class AnimationDirectorBus {
  private context: DirectorContext = { ...emptyContext }
  private planListeners = new Set<DirectorPlanListener>()
  private eventListeners = new Set<DirectorEventListener>()
  private bubbleListeners = new Set<DirectorBubbleListener>()
  private timelineListeners = new Set<DirectorTimelineListener>()
  private sequenceListeners = new Set<DirectorSequenceListener>()

  setContext(patch: Partial<DirectorContext>): void {
    this.context = { ...this.context, ...patch }
  }

  getContext(): DirectorContext {
    return this.context
  }

  emitPlan(plan: PerformancePlan): void {
    for (const listener of this.planListeners)
      listener(plan)
  }

  subscribePlans(listener: DirectorPlanListener): () => void {
    this.planListeners.add(listener)
    return () => {
      this.planListeners.delete(listener)
    }
  }

  /**
   * Publishes the assistant reply to the head bubble. `null` hides the bubble.
   * This channel is independent of the director, so the bubble works when the
   * director is disabled or the model call fails.
   */
  emitBubble(text: string | null): void {
    for (const listener of this.bubbleListeners)
      listener(text)
  }

  subscribeBubble(listener: DirectorBubbleListener): () => void {
    this.bubbleListeners.add(listener)
    return () => {
      this.bubbleListeners.delete(listener)
    }
  }

  emitEvent(event: AnimationEvent): void {
    for (const listener of this.eventListeners)
      listener(event)
  }

  subscribeEvents(listener: DirectorEventListener): () => void {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  emitTimeline(event: DirectorTimelineEvent): void {
    for (const listener of this.timelineListeners)
      listener(event)
  }

  subscribeTimeline(listener: DirectorTimelineListener): () => void {
    this.timelineListeners.add(listener)
    return () => {
      this.timelineListeners.delete(listener)
    }
  }

  /**
   * Publishes the waiting-phase sequence the stage plays after the reply ends.
   * The stage caches it until the session enters `waiting`.
   */
  emitSequence(sequence: ActionSequence): void {
    for (const listener of this.sequenceListeners)
      listener(sequence)
  }

  subscribeSequences(listener: DirectorSequenceListener): () => void {
    this.sequenceListeners.add(listener)
    return () => {
      this.sequenceListeners.delete(listener)
    }
  }
}

export const directorBus = new AnimationDirectorBus()
