import { describe, expect, it } from 'vitest'

import {
  createRuleBasedDayPlan,
  currentDayPlanBlock,
  dayKeyAt,
  isDayPlanThrottled,
  mergeDayPlan,
  nextDayPlanBlock,
  parseDayPlan,
  startOfNextDay,
  validateDayPlan,
} from './day-plan'

const timezone = 'Asia/Shanghai'
const generatedAt = '2026-10-26T09:00:00+08:00'
const expiresAt = '2026-10-27T00:00:00+08:00'

function createPlan(overrides: Record<string, unknown> = {}) {
  return {
    planVersion: 1,
    planId: '2026-10-26-main-1',
    characterId: 'main',
    timezone,
    generatedAt,
    expiresAt,
    blocks: [
      {
        id: 'block-1',
        startAt: '2026-10-26T09:30:00+08:00',
        durationMs: 900_000,
        kind: 'long',
        actionId: '放风筝',
        priority: 0.6,
        interruptible: true,
      },
      {
        id: 'block-2',
        startAt: '2026-10-26T10:00:00+08:00',
        durationMs: 5_000,
        kind: 'short',
        actionId: 'animations/伸懒腰.webm',
        priority: 0.3,
        interruptible: true,
      },
    ],
    ...overrides,
  }
}

describe('dayPlan', () => {
  it('parses a valid plan and keeps block order', () => {
    const result = parseDayPlan(createPlan())
    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(result.plan.blocks.map(block => block.id)).toEqual(['block-1', 'block-2'])
  })

  it('rejects a block with an invalid duration', () => {
    const result = parseDayPlan(createPlan({
      blocks: [{
        id: 'block-1',
        startAt: '2026-10-26T09:30:00+08:00',
        durationMs: 0,
        kind: 'short',
        actionId: 'x',
        priority: 0.3,
        interruptible: true,
      }],
    }))
    expect(result.ok).toBe(false)
  })

  it('rejects a plan whose expiresAt is not later than generatedAt', () => {
    const result = parseDayPlan(createPlan({ expiresAt: '2026-10-26T08:00:00+08:00' }))
    expect(result.ok).toBe(false)
  })

  it('drops unknown actions and blocks outside the plan window', () => {
    const result = validateDayPlan(createPlan({
      blocks: [
        ...createPlan().blocks,
        {
          id: 'block-3',
          startAt: '2026-10-26T10:30:00+08:00',
          durationMs: 1_000,
          kind: 'short',
          actionId: 'missing',
          priority: 0.3,
          interruptible: true,
        },
        {
          id: 'block-4',
          startAt: '2026-10-27T01:00:00+08:00',
          durationMs: 1_000,
          kind: 'short',
          actionId: 'animations/伸懒腰.webm',
          priority: 0.3,
          interruptible: true,
        },
      ],
    }), {
      characterId: 'main',
      availableActionIds: ['放风筝', 'animations/伸懒腰.webm'],
      now: Date.parse('2026-10-26T09:00:00+08:00'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.plan)
      return
    expect(result.plan.blocks.map(block => block.id)).toEqual(['block-1', 'block-2'])
    expect(result.issues.some(issue => issue.includes('unknown action'))).toBe(true)
    expect(result.issues.some(issue => issue.includes('outside the plan window'))).toBe(true)
  })

  it('reports an expired plan without returning blocks', () => {
    const result = validateDayPlan(createPlan(), {
      now: Date.parse('2026-10-27T00:00:00+08:00'),
    })
    expect(result.ok).toBe(false)
    expect(result.expired).toBe(true)
  })

  it('rejects a plan for another character', () => {
    const result = validateDayPlan(createPlan(), {
      characterId: 'character2',
      now: Date.parse('2026-10-26T10:00:00+08:00'),
    })
    expect(result.ok).toBe(false)
  })

  it('computes local day keys and next midnight in a timezone', () => {
    const at = Date.parse('2026-10-26T10:00:00+08:00')
    expect(dayKeyAt(at, timezone)).toBe('2026-10-26')
    expect(startOfNextDay(at, timezone)).toBe(Date.parse('2026-10-27T00:00:00+08:00'))
  })

  it('creates six to ten rule-based blocks for the rest of the day', () => {
    const now = Date.parse('2026-10-26T08:00:00+08:00')
    const plan = createRuleBasedDayPlan({
      characterId: 'main',
      now,
      timezone,
      shortActionIds: ['animations/a.webm', 'animations/b.webm'],
      random: () => 0.5,
    })

    expect(plan.blocks.length).toBeGreaterThanOrEqual(6)
    expect(plan.blocks.length).toBeLessThanOrEqual(10)
    for (const block of plan.blocks) {
      expect(Date.parse(block.startAt)).toBeGreaterThanOrEqual(now)
      expect(Date.parse(block.startAt)).toBeLessThan(Date.parse(plan.expiresAt))
      expect(block.kind).toBe('short')
    }
  })

  it('returns an empty plan when no action is available', () => {
    const plan = createRuleBasedDayPlan({
      characterId: 'main',
      now: Date.parse('2026-10-26T08:00:00+08:00'),
      timezone,
      shortActionIds: [],
    })
    expect(plan.blocks).toEqual([])
  })

  it('merges a reorder without touching started blocks', () => {
    const previous = createRuleBasedDayPlan({
      characterId: 'main',
      now: Date.parse('2026-10-26T08:00:00+08:00'),
      timezone,
      shortActionIds: ['animations/a.webm'],
      random: () => 0.5,
    })
    const next = createRuleBasedDayPlan({
      characterId: 'main',
      now: Date.parse('2026-10-26T12:00:00+08:00'),
      timezone,
      shortActionIds: ['animations/b.webm'],
      random: () => 0.5,
    })
    const now = Date.parse('2026-10-26T12:00:00+08:00')
    const merged = mergeDayPlan(previous, next, now)

    const past = previous.blocks.filter(block => Date.parse(block.startAt) <= now)
    expect(merged.blocks.slice(0, past.length)).toEqual(past)
    for (const block of merged.blocks.slice(past.length))
      expect(Date.parse(block.startAt)).toBeGreaterThan(now)
  })

  it('throttles two generations within ten minutes', () => {
    const now = Date.parse('2026-10-26T10:00:00+08:00')
    expect(isDayPlanThrottled(now - 9 * 60_000, now)).toBe(true)
    expect(isDayPlanThrottled(now - 11 * 60_000, now)).toBe(false)
  })

  it('finds the current and next block', () => {
    const result = parseDayPlan(createPlan())
    if (!result.ok)
      throw new Error('plan must parse')

    expect(currentDayPlanBlock(result.plan, Date.parse('2026-10-26T09:35:00+08:00'))?.id).toBe('block-1')
    expect(currentDayPlanBlock(result.plan, Date.parse('2026-10-26T10:10:00+08:00'))).toBeNull()
    expect(nextDayPlanBlock(result.plan, Date.parse('2026-10-26T09:35:00+08:00'))?.id).toBe('block-2')
  })
})
