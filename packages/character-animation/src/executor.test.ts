import type { CharacterCatalog } from './catalog'
import type { PerformancePlan } from './plan'

import { describe, expect, it } from 'vitest'

import { PerformancePlanExecutor } from './executor'

function createCatalog(): CharacterCatalog {
  return {
    catalogVersion: 1,
    packId: 'main',
    generatedAt: '2026-10-25T00:00:00.000Z',
    clips: [
      ['a.webm', '开心', 'happy'],
      ['b.webm', '害羞', 'shy'],
      ['c.webm', '得意', 'proud'],
      ['d.webm', '困倦', 'sleepy'],
    ].map(([id, name, tag]) => ({
      id,
      name,
      description: name,
      tags: [tag],
      valence: 0.5,
      arousal: 0.5,
      role: 'oneShot' as const,
      source: 'manual' as const,
    })),
  }
}

function createFakeClock(start = 0) {
  let now = start
  let nextId = 0
  const timers = new Map<number, { at: number, callback: () => void }>()

  return {
    now: () => now,
    setTimer: (delayMs: number, callback: () => void) => {
      const id = nextId++
      timers.set(id, { at: now + delayMs, callback })
      return () => {
        timers.delete(id)
      }
    },
    advance: (delayMs: number) => {
      now += delayMs
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((left, right) => left[1].at - right[1].at)
      for (const [id, timer] of due) {
        timers.delete(id)
        timer.callback()
      }
    },
  }
}

function createExecutor(clock: ReturnType<typeof createFakeClock>, onCue?: (clipId: string) => void) {
  return new PerformancePlanExecutor({
    clock,
    catalog: createCatalog(),
    onCue: cue => onCue?.(cue.clipId),
  })
}

function createPlan(): PerformancePlan {
  return {
    cues: [
      { anchor: { type: 'replyStart' }, clipId: 'a.webm', intensity: 0.7 },
      { anchor: { type: 'sentence', index: 1 }, clipId: 'b.webm', intensity: 0.7 },
      { anchor: { type: 'afterSpeech' }, clipId: 'c.webm', intensity: 0.7 },
      { anchor: { type: 'silence', seconds: 10 }, clipId: 'd.webm', intensity: 0.7 },
    ],
  }
}

describe('performancePlanExecutor', () => {
  it('runs cues at reply, sentence, speech end, and silence anchors', () => {
    const clock = createFakeClock()
    const emitted: string[] = []
    const executor = createExecutor(clock, clipId => emitted.push(clipId))
    executor.start(createPlan())

    expect(executor.handle({ type: 'replyStart' }).cues.map(cue => cue.clipId)).toEqual(['a.webm'])

    expect(executor.handle({ type: 'sentence', index: 1 }).cues.map(cue => cue.clipId)).toEqual(['b.webm'])
    expect(executor.handle({ type: 'speechEnd' }).cues.map(cue => cue.clipId)).toEqual(['c.webm'])
    expect(executor.notifyClipEnded('c.webm').cues).toEqual([])

    clock.advance(10_000)
    expect(emitted).toEqual(['d.webm'])
  })

  it('drops a queued clip when its cooldown is still active', () => {
    const clock = createFakeClock()
    const executor = createExecutor(clock)
    executor.start({
      cues: [
        { anchor: { type: 'replyStart' }, clipId: 'a.webm', intensity: 0.7 },
        { anchor: { type: 'sentence', index: 1 }, clipId: 'a.webm', intensity: 0.7 },
      ],
    })

    executor.handle({ type: 'replyStart' })
    const result = executor.handle({ type: 'sentence', index: 1 })

    expect(result.cues).toEqual([])
    expect(result.drops).toContainEqual({ clipId: 'a.webm', reason: 'clip-cooldown' })
    expect(executor.notifyClipEnded('a.webm').cues).toEqual([])
  })

  it('does not block a clip that only shares a secondary tag', () => {
    const clock = createFakeClock()
    const catalog = createCatalog()
    catalog.clips[0] = { ...catalog.clips[0], tags: ['shy', 'happy'] }
    catalog.clips[1] = { ...catalog.clips[1], tags: ['happy'] }

    const executor = new PerformancePlanExecutor({ clock, catalog })
    executor.start({
      cues: [
        { anchor: { type: 'replyStart' }, clipId: 'a.webm', intensity: 0.7 },
        { anchor: { type: 'sentence', index: 1 }, clipId: 'b.webm', intensity: 0.7 },
      ],
    })

    executor.handle({ type: 'replyStart' })
    const result = executor.handle({ type: 'sentence', index: 1 })
    expect(result.cues.map(cue => cue.clipId)).toEqual(['b.webm'])
    expect(result.drops).toEqual([])
  })

  it('queues two cues that share the same anchor', () => {
    const clock = createFakeClock()
    const executor = createExecutor(clock)
    executor.start({
      cues: [
        { anchor: { type: 'replyStart' }, clipId: 'a.webm', intensity: 0.7 },
        { anchor: { type: 'replyStart' }, clipId: 'b.webm', intensity: 0.7 },
      ],
    })

    expect(executor.handle({ type: 'replyStart' }).cues.map(cue => cue.clipId)).toEqual(['a.webm'])
    expect(executor.notifyClipEnded('a.webm').cues.map(cue => cue.clipId)).toEqual(['b.webm'])
  })

  it('holds cues while paused and plays them on resume', () => {
    const clock = createFakeClock()
    const executor = createExecutor(clock)
    executor.start(createPlan())
    executor.pause()

    expect(executor.handle({ type: 'replyStart' }).cues).toEqual([])

    const resumed = executor.resume()
    expect(resumed.cues.map(cue => cue.clipId)).toEqual(['a.webm'])
  })

  it('drops the plan after an interrupt', () => {
    const clock = createFakeClock()
    const executor = createExecutor(clock)
    executor.start(createPlan())

    executor.handle({ type: 'replyStart' })
    executor.interrupt()

    expect(executor.handle({ type: 'sentence', index: 1 }).cues).toEqual([])
    expect(executor.handle({ type: 'speechEnd' }).cues).toEqual([])
  })
})
