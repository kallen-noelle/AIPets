import * as v from 'valibot'

export type DayPlanBlockKind = 'long' | 'short'

export interface DayPlanBlock {
  id: string
  /** ISO 8601 timestamp with an offset. */
  startAt: string
  durationMs: number
  kind: DayPlanBlockKind
  /** Clip id for a short block, long action name for a long block. */
  actionId: string
  /** 0 to 1. Low priority blocks can be skipped while the user is present. */
  priority: number
  interruptible: boolean
}

/**
 * A coarse day schedule. Blocks describe what the character does during a
 * local day. The host persists it and only regenerates the remaining part.
 */
export interface DayPlan {
  planVersion: 1
  /** Plan epoch. Timer callbacks from an older plan carry a stale id. */
  planId: string
  characterId: string
  timezone: string
  generatedAt: string
  expiresAt: string
  blocks: DayPlanBlock[]
}

export type DayPlanParseResult
  = | { ok: true, plan: DayPlan }
    | { ok: false, issues: string[] }

export interface DayPlanValidationOptions {
  /** Reject a plan that belongs to another character. */
  characterId?: string
  /** Every block action must exist here. Unknown blocks are dropped. */
  availableActionIds?: string[]
  /** Clock override, in milliseconds. */
  now?: number
  maxBlocks?: number
}

export interface DayPlanValidationResult {
  ok: boolean
  plan: DayPlan | null
  issues: string[]
  /** True when the plan expired at `now`. */
  expired: boolean
}

export interface RuleBasedDayPlanOptions {
  characterId: string
  now: number
  timezone: string
  shortActionIds: string[]
  longActionIds?: string[]
  maxBlocks?: number
  random?: () => number
}

export interface DayPlanTimingOptions {
  defaultShortMs?: number
}

const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const longBlockMinMs = 5 * 60 * 1000
const longBlockMaxMs = 20 * 60 * 1000
const shortBlockMinMs = 2_000
const shortBlockMaxMs = 10_000
const defaultMaxBlocks = 24
const generationThrottleMs = 10 * 60 * 1000

function isIsoDateTime(value: string): boolean {
  return isoDateTimePattern.test(value) && Number.isFinite(Date.parse(value))
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    return true
  }
  catch {
    return false
  }
}

const isoDateTimeSchema = v.pipe(
  v.string(),
  v.check(isIsoDateTime, 'must be an ISO 8601 date-time with an offset'),
)

const blockSchema = v.object({
  id: v.pipe(v.string(), v.minLength(1)),
  startAt: isoDateTimeSchema,
  durationMs: v.pipe(v.number(), v.integer(), v.minValue(1)),
  kind: v.picklist(['long', 'short']),
  actionId: v.pipe(v.string(), v.minLength(1)),
  priority: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
  interruptible: v.boolean(),
})

export const dayPlanSchema = v.object({
  planVersion: v.literal(1),
  planId: v.pipe(v.string(), v.minLength(1)),
  characterId: v.pipe(v.string(), v.minLength(1)),
  timezone: v.pipe(v.string(), v.minLength(1), v.check(isValidTimezone, 'must be a valid IANA timezone')),
  generatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
  blocks: v.pipe(v.array(blockSchema), v.maxLength(48)),
})

function issuePaths(issues: v.BaseIssue<unknown>[]): string[] {
  return issues.map((issue) => {
    const path = issue.path?.map(item => String(item.key)).join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })
}

/**
 * Validates the shape only. Cross-field and clock checks live in
 * `validateDayPlan`, which also drops unusable blocks.
 */
export function parseDayPlan(input: unknown): DayPlanParseResult {
  const result = v.safeParse(dayPlanSchema, input)
  if (!result.success)
    return { ok: false, issues: issuePaths(result.issues) }

  const plan = result.output
  if (Date.parse(plan.expiresAt) <= Date.parse(plan.generatedAt)) {
    return { ok: false, issues: ['expiresAt must be later than generatedAt'] }
  }

  return { ok: true, plan }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function zonedParts(ms: number, timezone: string): { year: number, month: number, day: number, hour: number, minute: number, second: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts: Record<string, number> = {}
  for (const part of formatter.formatToParts(ms)) {
    if (part.type !== 'literal')
      parts[part.type] = Number(part.value)
  }

  return {
    year: parts.year ?? 1970,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: parts.hour ?? 0,
    minute: parts.minute ?? 0,
    second: parts.second ?? 0,
  }
}

function zonedOffsetMs(ms: number, timezone: string): number {
  const parts = zonedParts(ms, timezone)
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - ms
}

/** Local calendar day key in the plan timezone, for example `2026-10-26`. */
export function dayKeyAt(ms: number, timezone: string): string {
  const parts = zonedParts(ms, timezone)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  return `${parts.year}-${month}-${day}`
}

/** First millisecond of the next local day in the plan timezone. */
export function startOfNextDay(ms: number, timezone: string): number {
  const parts = zonedParts(ms, timezone)
  const localMidnight = Date.UTC(parts.year, parts.month - 1, parts.day + 1)
  const firstGuess = localMidnight - zonedOffsetMs(ms, timezone)
  const correctedGuess = localMidnight - zonedOffsetMs(firstGuess, timezone)

  // A daylight saving change near midnight can make the first guess land on
  // the wrong side of the transition. Recheck once with the offset at the
  // corrected instant.
  const correctedParts = zonedParts(correctedGuess, timezone)
  if (correctedParts.hour !== 0 || correctedParts.minute !== 0)
    return localMidnight - zonedOffsetMs(correctedGuess, timezone)

  return correctedGuess
}

export function isDayPlanExpired(plan: DayPlan, now: number): boolean {
  return now >= Date.parse(plan.expiresAt)
}

export function currentDayPlanBlock(plan: DayPlan, now: number): DayPlanBlock | null {
  let match: DayPlanBlock | null = null
  for (const block of plan.blocks) {
    const start = Date.parse(block.startAt)
    if (start > now || now >= start + block.durationMs)
      continue

    if (!match || start > Date.parse(match.startAt))
      match = block
  }

  return match
}

export function nextDayPlanBlock(plan: DayPlan, now: number): DayPlanBlock | null {
  let match: DayPlanBlock | null = null
  for (const block of plan.blocks) {
    const start = Date.parse(block.startAt)
    if (start <= now)
      continue

    if (!match || start < Date.parse(match.startAt))
      match = block
  }

  return match
}

/**
 * Drops blocks that cannot run.
 *
 * A schema error discards the entire plan. An unknown action or a block
 * outside the plan window drops that block only, so one bad entry cannot stop
 * the rest of the day.
 */
export function validateDayPlan(
  input: unknown,
  options: DayPlanValidationOptions = {},
): DayPlanValidationResult {
  const parsed = parseDayPlan(input)
  if (!parsed.ok)
    return { ok: false, plan: null, issues: parsed.issues, expired: false }

  const plan = parsed.plan
  const now = options.now ?? Date.now()
  const expired = isDayPlanExpired(plan, now)
  if (expired)
    return { ok: false, plan: null, issues: ['plan expired'], expired: true }

  if (options.characterId && plan.characterId !== options.characterId)
    return { ok: false, plan: null, issues: [`plan belongs to ${plan.characterId}`], expired: false }

  const issues: string[] = []
  const available = options.availableActionIds ? new Set(options.availableActionIds) : null
  const generatedAt = Date.parse(plan.generatedAt)
  const expiresAt = Date.parse(plan.expiresAt)
  const accepted: DayPlanBlock[] = []

  for (const block of plan.blocks) {
    const start = Date.parse(block.startAt)
    if (start < generatedAt || start >= expiresAt) {
      issues.push(`block dropped: ${block.id} starts outside the plan window`)
      continue
    }

    if (available && !available.has(block.actionId)) {
      issues.push(`block dropped: unknown action ${block.actionId}`)
      continue
    }

    accepted.push(block)
  }

  accepted.sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt))
  const maxBlocks = options.maxBlocks ?? defaultMaxBlocks
  if (accepted.length > maxBlocks) {
    const removed = accepted.splice(maxBlocks)
    for (const block of removed)
      issues.push(`block dropped: ${block.id} exceeds the ${maxBlocks} block limit`)
  }

  return {
    ok: true,
    plan: { ...plan, blocks: accepted },
    issues,
    expired: false,
  }
}

function normalizeShortDuration(value: number): number {
  return clamp(Math.round(value), shortBlockMinMs, shortBlockMaxMs)
}

/**
 * Builds a coarse rule-based plan for the rest of the local day.
 *
 * The plan is the offline fallback: it needs no model and always yields a
 * playable schedule. It spreads six to ten blocks over the remaining time and
 * prefers long actions when the pack provides them.
 */
export function createRuleBasedDayPlan(options: RuleBasedDayPlanOptions): DayPlan {
  const random = options.random ?? Math.random
  const shortActionIds = options.shortActionIds
  const longActionIds = options.longActionIds ?? []
  const expiresAt = startOfNextDay(options.now, options.timezone)
  const remainingMs = expiresAt - options.now
  const dayKey = dayKeyAt(options.now, options.timezone)

  const plan: DayPlan = {
    planVersion: 1,
    planId: `${dayKey}-${options.characterId}-rule-${options.now}`,
    characterId: options.characterId,
    timezone: options.timezone,
    generatedAt: new Date(options.now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    blocks: [],
  }

  if (remainingMs <= 0 || (!shortActionIds.length && !longActionIds.length))
    return plan

  const remainingHours = remainingMs / 3_600_000
  const desired = Math.ceil(remainingHours / 2)
  const minimum = remainingHours >= 3 ? 6 : 1
  const maxBlocks = options.maxBlocks ?? 10
  const count = Math.min(maxBlocks, Math.max(minimum, desired))
  const spacing = remainingMs / (count + 0.5)
  const tailGuard = Math.min(60_000, remainingMs * 0.05)
  const latestStart = expiresAt - tailGuard

  for (let index = 0; index < count; index += 1) {
    if (!shortActionIds.length && !longActionIds.length)
      break

    const jitter = (random() - 0.5) * spacing * 0.2
    const base = options.now + spacing * (index + 0.5) + jitter
    const start = clamp(base, options.now + 5_000, Math.max(options.now + 5_000, latestStart - 1_000))

    const useLong = longActionIds.length > 0 && index % 2 === 0
    const longDuration = clamp(Math.round(spacing * 0.5), longBlockMinMs, longBlockMaxMs)
    const fitsLong = useLong && start + longDuration <= expiresAt - tailGuard

    if (fitsLong) {
      plan.blocks.push({
        id: `block-${index + 1}`,
        startAt: new Date(start).toISOString(),
        durationMs: longDuration,
        kind: 'long',
        actionId: longActionIds[index % longActionIds.length],
        priority: 0.6,
        interruptible: true,
      })
      continue
    }

    if (!shortActionIds.length)
      continue

    plan.blocks.push({
      id: `block-${index + 1}`,
      startAt: new Date(start).toISOString(),
      durationMs: normalizeShortDuration(3_000 + random() * 3_000),
      kind: 'short',
      actionId: shortActionIds[index % shortActionIds.length],
      priority: 0.3,
      interruptible: true,
    })
  }

  return plan
}

/**
 * Keeps started blocks from the previous plan and appends only future blocks
 * from the new one. This prevents a reorder from replaying a completed block.
 */
export function mergeDayPlan(previous: DayPlan | null, next: DayPlan, now: number): DayPlan {
  if (!previous || previous.characterId !== next.characterId || previous.timezone !== next.timezone)
    return next

  const past = previous.blocks.filter(block => Date.parse(block.startAt) <= now)
  const future = next.blocks.filter(block => Date.parse(block.startAt) > now)

  return {
    ...next,
    blocks: [...past, ...future],
  }
}

/** True when two plan generations are closer than the reorder throttle. */
export function isDayPlanThrottled(lastGeneratedAt: number | undefined, now: number): boolean {
  return lastGeneratedAt !== undefined && now - lastGeneratedAt < generationThrottleMs
}

export const dayPlanDefaults = {
  maxBlocks: 10,
  reorderThrottleMs: generationThrottleMs,
}
