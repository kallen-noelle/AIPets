import * as v from 'valibot'

/**
 * One step of a 24 hour ambient program.
 *
 * The duration is nominal. Entry clips play inside it and do not shorten it.
 * A long action or end clip can therefore push the real runtime past the plan.
 */
export interface AmbientPhase {
  /** Nominal phase length, counted from the phase start. */
  durationMs: number
  /** One-shot clip ids played in order when the phase starts. */
  clips: string[]
  /** Long action name whose loop clip fills the rest of the phase. */
  holdLongAction?: string
}

/**
 * A duration based ambient program.
 *
 * Phase offsets are relative to `anchorAt`, so the program has no clock times
 * and no timezone. It repeats every `ambientProgramDurationMs(program)` until
 * the host starts a new one.
 */
export interface AmbientProgram {
  programVersion: 1
  programId: string
  characterId: string
  /** ISO 8601 instant the phase offsets count from. */
  anchorAt: string
  phases: AmbientPhase[]
}

export type AmbientProgramParseResult
  = | { ok: true, program: AmbientProgram }
    | { ok: false, issues: string[] }

export interface AmbientPhaseState {
  phase: AmbientPhase
  index: number
  /** Milliseconds from the anchor to this cycle's phase start. */
  phaseStartMs: number
  /** Milliseconds from the anchor to this cycle's phase end. */
  phaseEndMs: number
  /** Nominal time left in the phase. */
  remainingMs: number
  /** True when the phase started within `startGraceMs` of `now`. */
  atStart: boolean
  /** Zero-based cycle number since the anchor. */
  cycle: number
}

/** One playback step of a phase. The host scheduler, not the controller, runs it. */
export type AmbientStep
  = | { kind: 'clip', clipId: string }
    | { kind: 'hold', longAction: string }

/** Ordered steps for one phase. The hold step comes last when present. */
export function ambientPhaseSteps(phase: AmbientPhase): AmbientStep[] {
  const steps: AmbientStep[] = phase.clips.map((clipId): AmbientStep => ({ kind: 'clip', clipId }))
  if (phase.holdLongAction)
    steps.push({ kind: 'hold', longAction: phase.holdLongAction })
  return steps
}

const maxPhaseCount = 24
const maxProgramMs = 7 * 24 * 60 * 60 * 1000
const defaultStartGraceMs = 60_000

function isIsoDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && /\d{4}-\d{2}-\d{2}T/.test(value)
}

const phaseSchema = v.object({
  durationMs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  clips: v.optional(v.array(v.pipe(v.string(), v.minLength(1))), []),
  holdLongAction: v.optional(v.pipe(v.string(), v.minLength(1))),
})

export const ambientProgramSchema = v.object({
  programVersion: v.literal(1),
  programId: v.pipe(v.string(), v.minLength(1)),
  characterId: v.pipe(v.string(), v.minLength(1)),
  anchorAt: v.pipe(v.string(), v.check(isIsoDateTime, 'must be an ISO 8601 date-time')),
  phases: v.pipe(v.array(phaseSchema), v.minLength(1), v.maxLength(maxPhaseCount)),
})

/** Total nominal length of one program cycle. */
export function ambientProgramDurationMs(program: AmbientProgram): number {
  let total = 0
  for (const phase of program.phases)
    total += phase.durationMs
  return total
}

/** Returns the phase that covers `now`, wrapping to the next cycle. */
export function resolveAmbientPhase(
  program: AmbientProgram,
  now: number,
  options: { startGraceMs?: number } = {},
): AmbientPhaseState | null {
  const total = ambientProgramDurationMs(program)
  const anchor = Date.parse(program.anchorAt)
  if (total <= 0 || !Number.isFinite(anchor))
    return null

  // A clock jump backwards must not produce a negative phase index.
  const elapsed = Math.max(0, now - anchor)
  const cycle = Math.floor(elapsed / total)
  const local = elapsed % total
  const startGraceMs = options.startGraceMs ?? defaultStartGraceMs

  let cursor = 0
  for (let index = 0; index < program.phases.length; index++) {
    const phase = program.phases[index]
    const end = cursor + phase.durationMs
    const last = index === program.phases.length - 1
    if (local < end || last) {
      return {
        phase,
        index,
        phaseStartMs: cursor,
        phaseEndMs: end,
        remainingMs: Math.max(0, end - local),
        atStart: local - cursor <= startGraceMs,
        cycle,
      }
    }

    cursor = end
  }

  return null
}

/**
 * Validates the shape and the total length.
 *
 * A corrupted value must never crash the stage. The caller drops the whole
 * program when parsing fails and keeps the previous one.
 */
export function parseAmbientProgram(input: unknown): AmbientProgramParseResult {
  const result = v.safeParse(ambientProgramSchema, input)
  if (!result.success) {
    return {
      ok: false,
      issues: result.issues.map((issue) => {
        const path = issue.path?.map(item => String(item.key)).join('.')
        return path ? `${path}: ${issue.message}` : issue.message
      }),
    }
  }

  const program = result.output
  const total = ambientProgramDurationMs(program)
  if (total > maxProgramMs) {
    return { ok: false, issues: [`program is longer than ${maxProgramMs} ms`] }
  }

  return { ok: true, program }
}
