import * as v from 'valibot'

export type AffectLabel = 'excited' | 'content' | 'calm' | 'shy' | 'proud' | 'sad' | 'angry' | 'sleepy'

export type AffectEventKind = 'praise' | 'insult' | 'apology' | 'click' | 'ignored' | 'conversation'

export interface AffectBaseline {
  valence: number
  arousal: number
}

/**
 * Persona parameters that change how strongly an event moves affect and which
 * label wins when several labels match.
 */
export interface CharacterTraits {
  sensitivity: number
  shyness: number
  pride: number
  expressiveness: number
}

export interface AffectState {
  version: 1
  characterId: string
  valence: number
  arousal: number
  label: AffectLabel
  affinity: number
  updatedAt: number
  labelChangedAt: number
}

export interface AffectDelta {
  valence: number
  arousal: number
  affinity?: number
}

export const affectLabels = [
  'excited',
  'content',
  'calm',
  'shy',
  'proud',
  'sad',
  'angry',
  'sleepy',
] as const satisfies readonly AffectLabel[]

export const defaultCharacterTraits: CharacterTraits = {
  sensitivity: 1,
  shyness: 0.3,
  pride: 0.3,
  expressiveness: 1,
}

export const affectLimits = {
  maxTurnValence: 0.2,
  maxTurnArousal: 0.15,
  maxDirectorValence: 0.1,
  maxDirectorArousal: 0.08,
  valenceHalfLifeMs: 60 * 60 * 1000,
  arousalHalfLifeMs: 20 * 60 * 1000,
  labelHysteresis: 0.08,
  labelMinDwellMs: 30 * 1000,
  affinityMax: 100,
} as const

const affectEventDeltas: Record<AffectEventKind, AffectDelta> = {
  praise: { valence: 0.12, arousal: 0.05, affinity: 2 },
  insult: { valence: -0.35, arousal: 0.06, affinity: -3 },
  apology: { valence: 0.08, arousal: -0.02, affinity: 1 },
  click: { valence: 0.02, arousal: 0.02, affinity: 0 },
  ignored: { valence: -0.02, arousal: -0.01, affinity: 0 },
  conversation: { valence: 0.005, arousal: 0.01, affinity: 1 },
}

interface LabelRule {
  label: AffectLabel
  test: (valence: number, arousal: number, traits: CharacterTraits) => boolean
}

const arousalSplit = 0.55

// Rules are ordered. The first match wins. Hysteresis only applies across the
// arousal split, where content and excited or sad and angry would otherwise
// flicker on every small value change.
const labelRules: LabelRule[] = [
  {
    label: 'proud',
    test: (valence, arousal, traits) =>
      traits.pride >= 0.6
      && valence >= 0.3
      && arousal <= 0.7,
  },
  {
    label: 'excited',
    test: (valence, arousal) =>
      valence >= 0.45
      && arousal >= arousalSplit,
  },
  {
    label: 'shy',
    test: (valence, arousal, traits) =>
      traits.shyness >= 0.6
      && valence >= 0.2
      && valence <= 0.7
      && arousal >= 0.25
      && arousal <= 0.65,
  },
  {
    label: 'content',
    test: (valence, arousal) =>
      valence >= 0.45
      && arousal < arousalSplit,
  },
  {
    label: 'angry',
    test: (valence, arousal) =>
      valence <= -0.1
      && arousal >= arousalSplit,
  },
  {
    label: 'sad',
    test: (valence, arousal) =>
      valence <= -0.1
      && arousal < arousalSplit,
  },
  {
    label: 'calm',
    test: (valence, arousal) =>
      valence > -0.1
      && valence < 0.45
      && arousal < arousalSplit,
  },
]

function isNearArousalSplit(previous: AffectLabel, next: AffectLabel, arousal: number): boolean {
  const oppositePair = (previous === 'content' && next === 'excited')
    || (previous === 'excited' && next === 'content')
    || (previous === 'sad' && next === 'angry')
    || (previous === 'angry' && next === 'sad')
  return oppositePair && Math.abs(arousal - arousalSplit) <= affectLimits.labelHysteresis
}

function isAdjacentLabelPair(previous: AffectLabel, next: AffectLabel): boolean {
  return (previous === 'content' && next === 'excited')
    || (previous === 'excited' && next === 'content')
    || (previous === 'sad' && next === 'angry')
    || (previous === 'angry' && next === 'sad')
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampBaseline(baseline: AffectBaseline): AffectBaseline {
  return {
    valence: clamp(Number.isFinite(baseline.valence) ? baseline.valence : 0, -1, 1),
    arousal: clamp(Number.isFinite(baseline.arousal) ? baseline.arousal : 0, 0, 1),
  }
}

/**
 * Derives the display label for an affect value.
 *
 * When `previous` is given, the previous rule is tested with a wider margin.
 * A value near a boundary therefore keeps its current label instead of
 * flickering between two labels.
 *
 * @example
 * resolveAffectLabel({ valence: 0.5, arousal: 0.7 }, traits)
 * // => 'excited'
 */
export function resolveAffectLabel(
  values: { valence: number, arousal: number },
  traits: CharacterTraits,
  previous?: AffectLabel,
  sleepiness?: number,
): AffectLabel {
  const { valence, arousal } = values

  if (sleepiness !== undefined) {
    if (sleepiness >= 0.75)
      return 'sleepy'
    if (previous === 'sleepy' && sleepiness >= 0.75 - affectLimits.labelHysteresis)
      return 'sleepy'
  }

  let next: AffectLabel = 'calm'
  for (const rule of labelRules) {
    if (rule.test(valence, arousal, traits)) {
      next = rule.label
      break
    }
  }

  if (previous && isNearArousalSplit(previous, next, arousal))
    return previous

  return next
}

/**
 * Creates the persisted affect state for one character.
 *
 * `labelChangedAt` is backdated so the first real event can change the label
 * immediately.
 */
export function createAffectState(options: {
  characterId: string
  baseline: AffectBaseline
  traits: CharacterTraits
  now: number
  affinity?: number
  sleepiness?: number
}): AffectState {
  const baseline = clampBaseline(options.baseline)
  return {
    version: 1,
    characterId: options.characterId,
    valence: baseline.valence,
    arousal: baseline.arousal,
    label: resolveAffectLabel(baseline, options.traits, undefined, options.sleepiness),
    affinity: clamp(options.affinity ?? 0, 0, affectLimits.affinityMax),
    updatedAt: options.now,
    labelChangedAt: options.now - affectLimits.labelMinDwellMs,
  }
}

/**
 * Applies an affect delta with a per-turn cap, edge compression, and label
 * dwell rules.
 *
 * Edge compression reduces the gain near ±1 so repeated praise cannot pin the
 * character at a boundary.
 */
export function applyAffectDelta(
  state: AffectState,
  delta: AffectDelta,
  traits: CharacterTraits,
  options: {
    now: number
    sleepiness?: number
    maxValenceDelta?: number
    maxArousalDelta?: number
    minLabelDwellMs?: number
  },
): AffectState {
  const maxValence = options.maxValenceDelta ?? affectLimits.maxTurnValence
  const maxArousal = options.maxArousalDelta ?? affectLimits.maxTurnArousal
  const minDwellMs = options.minLabelDwellMs ?? affectLimits.labelMinDwellMs

  const requestedValence = clamp(Number.isFinite(delta.valence) ? delta.valence : 0, -maxValence, maxValence)
  const requestedArousal = clamp(Number.isFinite(delta.arousal) ? delta.arousal : 0, -maxArousal, maxArousal)

  const valenceGain = Math.max(0.35, 1 - Math.abs(state.valence) * 0.5)
  const arousalGain = Math.max(0.35, 1 - Math.abs(state.arousal - 0.5) * 2)
  const valence = clamp(state.valence + requestedValence * valenceGain, -1, 1)
  const arousal = clamp(state.arousal + requestedArousal * arousalGain, 0, 1)

  const candidate = resolveAffectLabel({ valence, arousal }, traits, state.label, options.sleepiness)
  const strongChange = Math.abs(requestedValence) >= 0.2
  const canChangeLabel = strongChange
    || !isAdjacentLabelPair(state.label, candidate)
    || options.now - state.labelChangedAt >= minDwellMs
  const label = candidate === state.label || canChangeLabel ? candidate : state.label
  const labelChangedAt = label === state.label ? state.labelChangedAt : options.now

  const affinityDelta = typeof delta.affinity === 'number' && Number.isFinite(delta.affinity)
    ? delta.affinity
    : 0

  return {
    ...state,
    valence,
    arousal,
    label,
    affinity: clamp(state.affinity + affinityDelta, 0, affectLimits.affinityMax),
    updatedAt: options.now,
    labelChangedAt,
  }
}

export function affectEventDelta(kind: AffectEventKind): AffectDelta {
  const delta = affectEventDeltas[kind]
  return { ...delta }
}

/**
 * Applies one rule-based event. Persona sensitivity scales valence and
 * arousal. Affinity uses the raw rule value.
 */
export function applyAffectEvent(
  state: AffectState,
  kind: AffectEventKind,
  traits: CharacterTraits,
  options: {
    now: number
    sleepiness?: number
    baseline?: AffectBaseline
  },
): AffectState {
  const base = affectEventDeltas[kind]
  return applyAffectDelta(state, {
    valence: base.valence * traits.sensitivity,
    arousal: base.arousal * traits.sensitivity,
    affinity: base.affinity,
  }, traits, {
    ...options,
    // Strong rule events use the single-event cap, not the smaller director
    // cap. The merge cap still limits a whole turn.
    maxValenceDelta: 0.35,
    maxArousalDelta: 0.2,
  })
}

/**
 * Moves affect back toward the persona baseline with an exponential half-life.
 *
 * The caller passes the current time. The function uses `updatedAt` to cover
 * app restarts, suspend, and cross-day gaps without a background timer.
 */
export function decayAffect(
  state: AffectState,
  options: {
    now: number
    baseline: AffectBaseline
    traits: CharacterTraits
    sleepiness?: number
    valenceHalfLifeMs?: number
    arousalHalfLifeMs?: number
  },
): AffectState {
  const elapsedMs = options.now - state.updatedAt
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0)
    return state

  const baseline = clampBaseline(options.baseline)
  const valenceHalfLife = options.valenceHalfLifeMs ?? affectLimits.valenceHalfLifeMs
  const arousalHalfLife = options.arousalHalfLifeMs ?? affectLimits.arousalHalfLifeMs
  const valenceFactor = 2 ** (-elapsedMs / valenceHalfLife)
  const arousalFactor = 2 ** (-elapsedMs / arousalHalfLife)

  const valence = clamp(baseline.valence + (state.valence - baseline.valence) * valenceFactor, -1, 1)
  const arousal = clamp(baseline.arousal + (state.arousal - baseline.arousal) * arousalFactor, 0, 1)
  const candidate = resolveAffectLabel({ valence, arousal }, options.traits, state.label, options.sleepiness)
  const canChangeLabel = !isAdjacentLabelPair(state.label, candidate)
    || options.now - state.labelChangedAt >= affectLimits.labelMinDwellMs
  const label = candidate === state.label || canChangeLabel ? candidate : state.label

  return {
    ...state,
    valence,
    arousal,
    label,
    updatedAt: options.now,
    labelChangedAt: label === state.label ? state.labelChangedAt : options.now,
  }
}

export const affectStateSchema = v.object({
  version: v.literal(1),
  characterId: v.pipe(v.string(), v.minLength(1)),
  valence: v.pipe(v.number(), v.finite('valence must be finite'), v.minValue(-1), v.maxValue(1)),
  arousal: v.pipe(v.number(), v.finite('arousal must be finite'), v.minValue(0), v.maxValue(1)),
  label: v.picklist(affectLabels),
  affinity: v.pipe(v.number(), v.finite('affinity must be finite'), v.minValue(0), v.maxValue(100)),
  updatedAt: v.pipe(v.number(), v.finite('updatedAt must be finite'), v.minValue(0)),
  labelChangedAt: v.pipe(v.number(), v.finite('labelChangedAt must be finite'), v.minValue(0)),
})

export type AffectStateParseResult
  = | { ok: true, state: AffectState }
    | { ok: false, issues: string[] }

/**
 * Parses persisted affect state. A version mismatch is an error and the caller
 * must reset to the baseline. Persisted local state has no compatibility path.
 */
export function parseAffectState(input: unknown): AffectStateParseResult {
  const result = v.safeParse(affectStateSchema, input)
  if (!result.success) {
    return {
      ok: false,
      issues: result.issues.map((issue) => {
        const path = issue.path?.map(item => String(item.key)).join('.')
        return path ? `${path}: ${issue.message}` : issue.message
      }),
    }
  }

  return { ok: true, state: result.output }
}
