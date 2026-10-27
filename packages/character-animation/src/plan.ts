import type { CharacterCatalog, ClipDescriptor } from './catalog'

import * as v from 'valibot'

import { clipHasAnyTag } from './catalog'

export type PlanAnchor
  = | { type: 'replyStart' }
    | { type: 'sentence', index: number }
    | { type: 'afterSpeech' }
    | { type: 'silence', seconds: number }

export interface PerformanceAffectDelta {
  valence: number
  arousal: number
}

export interface PerformanceCue {
  anchor: PlanAnchor
  clipId: string
  intensity: number
  /** Seconds for a long action. Long actions repeat their mid clip to reach it. */
  durationSeconds?: number
  reason?: string
}

/**
 * A bounded, executable performance plan. The director produces it. The
 * executor schedules it. The plan never carries absolute timestamps because
 * speech duration is not known in advance.
 */
export interface PerformancePlan {
  affect?: PerformanceAffectDelta
  cues: PerformanceCue[]
  ambient?: string[]
}

export interface PlanValidationOptions {
  catalog: CharacterCatalog
  /** Names of long actions in the active pack. A cue with a duration must use one. */
  longActionIds?: string[]
  maxCues?: number
  maxValenceDelta?: number
  maxArousalDelta?: number
  forbiddenTags?: string[]
}

export interface PlanValidationResult {
  ok: boolean
  plan: PerformancePlan | null
  issues: string[]
}

export type PerformancePlanParseResult
  = | { ok: true, plan: PerformancePlan }
    | { ok: false, issues: string[] }

const anchorSchema = v.union([
  v.object({ type: v.literal('replyStart') }),
  v.object({
    type: v.literal('sentence'),
    index: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)),
  }),
  v.object({ type: v.literal('afterSpeech') }),
  v.object({
    type: v.literal('silence'),
    seconds: v.pipe(v.number(), v.finite('seconds must be finite'), v.minValue(0), v.maxValue(600)),
  }),
])

const affectDeltaSchema = v.object({
  valence: v.pipe(v.number(), v.finite('valence must be finite')),
  arousal: v.pipe(v.number(), v.finite('arousal must be finite')),
})

const cueSchema = v.object({
  anchor: anchorSchema,
  clipId: v.pipe(v.string(), v.minLength(1)),
  intensity: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1)), 0.7),
  durationSeconds: v.optional(v.pipe(v.number(), v.finite('durationSeconds must be finite'), v.minValue(1), v.maxValue(600))),
  reason: v.optional(v.pipe(v.string(), v.maxLength(200))),
})

export const performancePlanSchema = v.object({
  affect: v.optional(affectDeltaSchema),
  cues: v.pipe(v.array(cueSchema), v.maxLength(8)),
  ambient: v.optional(v.pipe(v.array(v.pipe(v.string(), v.minLength(1))), v.maxLength(8))),
})

export function parsePerformancePlan(input: unknown): PerformancePlanParseResult {
  const result = v.safeParse(performancePlanSchema, input)
  if (!result.success) {
    return {
      ok: false,
      issues: result.issues.map((issue) => {
        const path = issue.path?.map(item => String(item.key)).join('.')
        return path ? `${path}: ${issue.message}` : issue.message
      }),
    }
  }

  return { ok: true, plan: result.output }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function anchorOrder(anchor: PlanAnchor): number {
  switch (anchor.type) {
    case 'replyStart':
      return 0
    case 'sentence':
      return 100 + anchor.index
    case 'afterSpeech':
      return 1000
    case 'silence':
      return 2000 + anchor.seconds
  }
}

export function comparePlanAnchors(left: PlanAnchor, right: PlanAnchor): number {
  return anchorOrder(left) - anchorOrder(right)
}

/**
 * Validates a director plan against the active pack.
 *
 * Schema errors drop the entire plan. Individual cues with unknown clips,
 * forbidden tags, or duplicate ids are dropped without failing the plan.
 * Affect deltas are clamped to the director caps.
 */
export function validatePerformancePlan(
  input: unknown,
  options: PlanValidationOptions,
): PlanValidationResult {
  const parsed = parsePerformancePlan(input)
  if (!parsed.ok)
    return { ok: false, plan: null, issues: parsed.issues }

  const issues: string[] = []
  const maxCues = options.maxCues ?? 3
  const maxValence = options.maxValenceDelta ?? 0.1
  const maxArousal = options.maxArousalDelta ?? 0.08
  const forbiddenTags = options.forbiddenTags ?? []

  let affect: PerformanceAffectDelta | undefined
  if (parsed.plan.affect) {
    affect = {
      valence: clamp(parsed.plan.affect.valence, -maxValence, maxValence),
      arousal: clamp(parsed.plan.affect.arousal, -maxArousal, maxArousal),
    }
  }

  const acceptedCues: PerformanceCue[] = []
  const seenClipIds = new Set<string>()
  const descriptors = new Map<string, ClipDescriptor>(options.catalog.clips.map(clip => [clip.id, clip]))
  const longActionIds = new Set(options.longActionIds ?? [])

  for (const cue of parsed.plan.cues) {
    if (acceptedCues.length >= maxCues) {
      issues.push(`cue dropped: ${cue.clipId} exceeds the ${maxCues} cue limit`)
      continue
    }

    if (seenClipIds.has(cue.clipId)) {
      issues.push(`cue dropped: duplicate clip ${cue.clipId}`)
      continue
    }

    const isLongAction = longActionIds.has(cue.clipId)
    if (isLongAction) {
      if (cue.durationSeconds === undefined) {
        issues.push(`cue dropped: long action ${cue.clipId} needs durationSeconds`)
        continue
      }
    }
    else {
      if (cue.durationSeconds !== undefined) {
        issues.push(`cue dropped: ${cue.clipId} is not a long action`)
        continue
      }

      const descriptor = descriptors.get(cue.clipId)
      if (!descriptor) {
        issues.push(`cue dropped: unknown clip ${cue.clipId}`)
        continue
      }

      if (forbiddenTags.length && clipHasAnyTag(descriptor, forbiddenTags)) {
        issues.push(`cue dropped: ${cue.clipId} uses a forbidden tag`)
        continue
      }
    }

    seenClipIds.add(cue.clipId)
    acceptedCues.push({
      ...cue,
      intensity: clamp(cue.intensity, 0, 1),
    })
  }

  const ambient = parsed.plan.ambient?.filter((clipId) => {
    if (!descriptors.has(clipId)) {
      issues.push(`ambient dropped: unknown clip ${clipId}`)
      return false
    }
    return true
  })

  acceptedCues.sort((left, right) => comparePlanAnchors(left.anchor, right.anchor))

  return {
    ok: true,
    plan: {
      ...(affect ? { affect } : {}),
      cues: acceptedCues,
      ...(ambient?.length ? { ambient } : {}),
    },
    issues,
  }
}

export function createEmptyPerformancePlan(): PerformancePlan {
  return { cues: [] }
}
