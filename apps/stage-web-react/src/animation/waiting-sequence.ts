import type { ActionSequence, AnimationClockPort, AnimationEvent, SequenceStep } from '@proj-aipets/character-animation'

import { SequenceRunner, sequenceStepDurationMs, truncateSequenceToBudget } from '@proj-aipets/character-animation'

export interface WaitingSequenceOptions {
  dispatch: (event: AnimationEvent) => void
  clock: AnimationClockPort
  /** Returns a known clip length, so a short step lasts as long as its clip. */
  clipDurationMs?: (clipId: string) => number | undefined
  /** Start plus end clips of a long action. */
  longOverheadMs?: number
}

/**
 * Plays the waiting-phase steps one at a time.
 *
 * A short step maps to a one-shot clip. A long step maps to the controller long
 * action entry, so the controller owns the start, loop, timer, and end clip.
 * `interrupt()` cuts a short step and sends a long step through its end clip.
 */
export class WaitingSequenceRunner {
  private readonly dispatch: (event: AnimationEvent) => void
  private readonly clipDurationMs?: (clipId: string) => number | undefined
  private readonly longOverheadMs?: number
  private readonly runner: SequenceRunner
  private current: SequenceStep | null = null

  constructor(options: WaitingSequenceOptions) {
    this.dispatch = options.dispatch
    this.clipDurationMs = options.clipDurationMs
    this.longOverheadMs = options.longOverheadMs
    this.runner = new SequenceRunner({
      clock: options.clock,
      durationFor: step => this.durationFor(step),
      onStep: step => this.playStep(step),
      onFinish: () => {
        this.current = null
      },
    })
  }

  get running(): boolean {
    return this.runner.running
  }

  /** Plays a sequence cut to the session budget. Returns the accepted length. */
  play(sequence: ActionSequence, budgetMs: number): number {
    const budget = truncateSequenceToBudget(sequence, budgetMs, { longOverheadMs: this.longOverheadMs })
    this.current = null
    this.runner.start(budget.sequence)
    return budget.totalMs
  }

  interrupt(): void {
    const step = this.current
    this.runner.interrupt()
    this.current = null
    if (step?.kind === 'long')
      this.dispatch({ type: 'longActionStop' })
  }

  private playStep(step: SequenceStep): void {
    this.current = step
    if (step.kind === 'long') {
      this.dispatch({ type: 'action', name: step.actionId, durationMs: step.durationMs })
      return
    }

    this.dispatch({ type: 'playClip', clipId: step.actionId })
  }

  private durationFor(step: SequenceStep): number {
    if (step.kind === 'long')
      return sequenceStepDurationMs(step, { longOverheadMs: this.longOverheadMs })

    return step.durationMs ?? this.clipDurationMs?.(step.actionId) ?? sequenceStepDurationMs(step)
  }
}
