import type { AnimationClockPort } from './types'

import * as v from 'valibot'

export interface SequenceShortStep {
  kind: 'short'
  /** Clip id in the active pack. */
  actionId: string
  /** Optional clip length. Playback advances on this value or the default. */
  durationMs?: number
}

export interface SequenceLongStep {
  kind: 'long'
  /** Long action name in the active pack. */
  actionId: string
  /** Mid-loop budget. Start and end clips are added on top. */
  durationMs: number
}

export type SequenceStep = SequenceShortStep | SequenceLongStep

export interface ActionSequence {
  steps: SequenceStep[]
}

export type SequenceParseResult
  = | { ok: true, sequence: ActionSequence }
    | { ok: false, issues: string[] }

export interface SequenceValidationOptions {
  /** Every short step must reference one of these clip ids. */
  clipIds?: string[]
  /** Every long step must reference one of these long action names. */
  longActionIds?: string[]
  maxSteps?: number
}

export interface SequenceValidationResult {
  ok: boolean
  sequence: ActionSequence | null
  issues: string[]
}

export interface SequenceBudgetOptions {
  /** Used when a short step does not declare a duration. */
  defaultShortMs?: number
  /** Start plus end clips of a long action, added to its mid budget. */
  longOverheadMs?: number
}

export interface TruncatedSequence {
  sequence: ActionSequence
  dropped: SequenceStep[]
  truncated: boolean
  totalMs: number
}

export interface SequenceRunnerOptions {
  clock: AnimationClockPort
  durationFor?: (step: SequenceStep) => number
  onStep?: (step: SequenceStep, index: number) => void
  onFinish?: () => void
}

export const defaultShortStepMs = 3_000
export const defaultLongStepOverheadMs = 10_000

const shortStepSchema = v.object({
  kind: v.literal('short'),
  actionId: v.pipe(v.string(), v.minLength(1)),
  durationMs: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
})

const longStepSchema = v.object({
  kind: v.literal('long'),
  actionId: v.pipe(v.string(), v.minLength(1)),
  durationMs: v.pipe(v.number(), v.integer(), v.minValue(1_000)),
})

export const actionSequenceSchema = v.object({
  steps: v.pipe(v.array(v.union([shortStepSchema, longStepSchema])), v.maxLength(12)),
})

function issuePaths(issues: v.BaseIssue<unknown>[]): string[] {
  return issues.map((issue) => {
    const path = issue.path?.map(item => String(item.key)).join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
}

export function parseActionSequence(input: unknown): SequenceParseResult {
  const result = v.safeParse(actionSequenceSchema, input)
  if (!result.success)
    return { ok: false, issues: issuePaths(result.issues) }

  return { ok: true, sequence: result.output }
}

/**
 * Drops unknown and duplicate steps. A schema error discards the sequence.
 */
export function validateActionSequence(
  input: unknown,
  options: SequenceValidationOptions = {},
): SequenceValidationResult {
  const parsed = parseActionSequence(input)
  if (!parsed.ok)
    return { ok: false, sequence: null, issues: parsed.issues }

  const issues: string[] = []
  const maxSteps = options.maxSteps ?? 6
  const clipIds = options.clipIds ? new Set(options.clipIds) : null
  const longActionIds = options.longActionIds ? new Set(options.longActionIds) : null
  const seen = new Set<string>()
  const steps: SequenceStep[] = []

  for (const step of parsed.sequence.steps) {
    if (steps.length >= maxSteps) {
      issues.push(`step dropped: ${step.actionId} exceeds the ${maxSteps} step limit`)
      continue
    }

    const key = `${step.kind}:${step.actionId}`
    if (seen.has(key)) {
      issues.push(`step dropped: duplicate ${step.kind} action ${step.actionId}`)
      continue
    }

    if (step.kind === 'short' && clipIds && !clipIds.has(step.actionId)) {
      issues.push(`step dropped: unknown clip ${step.actionId}`)
      continue
    }

    if (step.kind === 'long' && longActionIds && !longActionIds.has(step.actionId)) {
      issues.push(`step dropped: unknown long action ${step.actionId}`)
      continue
    }

    seen.add(key)
    steps.push(step)
  }

  return { ok: true, sequence: { steps }, issues }
}

export function sequenceStepDurationMs(
  step: SequenceStep,
  options: SequenceBudgetOptions = {},
): number {
  if (step.kind === 'short')
    return Math.max(0, step.durationMs ?? options.defaultShortMs ?? defaultShortStepMs)

  return Math.max(0, step.durationMs + (options.longOverheadMs ?? defaultLongStepOverheadMs))
}

/**
 * Cuts a sequence at a step boundary so its full length fits the window.
 *
 * A step that does not fit is dropped with every step after it. A long action
 * that is already playing is never shortened at runtime, because the budget is
 * enforced before playback starts.
 */
export function truncateSequenceToBudget(
  sequence: ActionSequence,
  budgetMs: number,
  options: SequenceBudgetOptions = {},
): TruncatedSequence {
  if (budgetMs <= 0) {
    return {
      sequence: { steps: [] },
      dropped: [...sequence.steps],
      truncated: sequence.steps.length > 0,
      totalMs: 0,
    }
  }

  const accepted: SequenceStep[] = []
  let totalMs = 0
  let stopIndex = sequence.steps.length

  for (let index = 0; index < sequence.steps.length; index += 1) {
    const step = sequence.steps[index]
    const duration = sequenceStepDurationMs(step, options)
    if (totalMs + duration > budgetMs) {
      stopIndex = index
      break
    }

    accepted.push(step)
    totalMs += duration
  }

  return {
    sequence: { steps: accepted },
    dropped: sequence.steps.slice(stopIndex),
    truncated: stopIndex < sequence.steps.length,
    totalMs,
  }
}

/**
 * Plays sequence steps one at a time with the injected clock.
 *
 * The runner is runtime-agnostic. The host maps each step to a clip or a long
 * action. `interrupt()` cuts the current step without calling `onFinish`.
 */
export class SequenceRunner {
  private readonly clock: AnimationClockPort
  private readonly durationFor?: (step: SequenceStep) => number
  private readonly onStep?: (step: SequenceStep, index: number) => void
  private readonly onFinish?: () => void

  private sequence: ActionSequence | null = null
  private index = -1
  private timer: (() => void) | null = null

  constructor(options: SequenceRunnerOptions) {
    this.clock = options.clock
    this.durationFor = options.durationFor
    this.onStep = options.onStep
    this.onFinish = options.onFinish
  }

  get running(): boolean {
    return this.sequence !== null
  }

  get snapshot(): { running: boolean, index: number, step: SequenceStep | null } {
    const step = this.sequence && this.index >= 0
      ? this.sequence.steps[this.index] ?? null
      : null
    return { running: this.sequence !== null, index: this.index, step }
  }

  start(sequence: ActionSequence): void {
    this.clearTimer()
    this.sequence = sequence.steps.length ? sequence : null
    this.index = -1

    if (!this.sequence) {
      this.onFinish?.()
      return
    }

    this.advance()
  }

  interrupt(): void {
    this.clearTimer()
    this.sequence = null
    this.index = -1
  }

  private advance(): void {
    const sequence = this.sequence
    if (!sequence)
      return

    this.index += 1
    const step = sequence.steps[this.index]
    if (!step) {
      this.sequence = null
      this.index = -1
      this.onFinish?.()
      return
    }

    this.onStep?.(step, this.index)
    // A step handler can interrupt the runner, so check ownership again.
    if (this.sequence !== sequence)
      return

    const duration = Math.max(0, this.durationFor?.(step) ?? sequenceStepDurationMs(step))
    this.timer = this.clock.setTimer(duration, () => {
      this.timer = null
      this.advance()
    })
  }

  private clearTimer(): void {
    if (!this.timer)
      return

    this.timer()
    this.timer = null
  }
}
