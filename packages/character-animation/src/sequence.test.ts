import type { SequenceStep } from './sequence'

import { describe, expect, it } from 'vitest'

import {
  parseActionSequence,
  SequenceRunner,
  sequenceStepDurationMs,
  truncateSequenceToBudget,
  validateActionSequence,
} from './sequence'

const clipIds = ['animations/wave.webm', 'animations/tilt.webm', 'animations/stretch.webm']
const longActionIds = ['放风筝']

function createFakeClock() {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number, callback: () => void }>()

  return {
    clock: {
      now: () => now,
      setTimer: (delayMs: number, callback: () => void) => {
        const id = nextId++
        timers.set(id, { at: now + delayMs, callback })
        return () => timers.delete(id)
      },
    },
    advance(ms: number) {
      now += ms
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id)
          timer.callback()
        }
      }
    },
    pending: () => timers.size,
  }
}

describe('actionSequence', () => {
  it('parses a step list', () => {
    const result = parseActionSequence({
      steps: [
        { kind: 'short', actionId: 'animations/wave.webm' },
        { kind: 'long', actionId: '放风筝', durationMs: 40_000 },
      ],
    })
    expect(result.ok).toBe(true)
  })

  it('drops unknown, duplicate, and over-limit steps', () => {
    const result = validateActionSequence({
      steps: [
        { kind: 'short', actionId: 'animations/wave.webm' },
        { kind: 'short', actionId: 'animations/wave.webm' },
        { kind: 'short', actionId: 'missing.webm' },
        { kind: 'long', actionId: 'missing-long', durationMs: 30_000 },
        { kind: 'long', actionId: '放风筝', durationMs: 30_000 },
      ],
    }, { clipIds, longActionIds, maxSteps: 2 })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.sequence)
      return
    expect(result.sequence.steps).toEqual([
      { kind: 'short', actionId: 'animations/wave.webm' },
      { kind: 'long', actionId: '放风筝', durationMs: 30_000 },
    ])
    expect(result.issues.some(issue => issue.includes('duplicate'))).toBe(true)
    expect(result.issues.some(issue => issue.includes('unknown clip'))).toBe(true)
    expect(result.issues.some(issue => issue.includes('unknown long action'))).toBe(true)
  })

  it('computes step duration with long action overhead', () => {
    const short: SequenceStep = { kind: 'short', actionId: 'animations/wave.webm' }
    const long: SequenceStep = { kind: 'long', actionId: '放风筝', durationMs: 40_000 }

    expect(sequenceStepDurationMs(short)).toBe(3_000)
    expect(sequenceStepDurationMs(short, { defaultShortMs: 2_000 })).toBe(2_000)
    expect(sequenceStepDurationMs(long)).toBe(50_000)
    expect(sequenceStepDurationMs(long, { longOverheadMs: 0 })).toBe(40_000)
  })

  it('cuts the sequence at a step boundary', () => {
    const result = truncateSequenceToBudget({
      steps: [
        { kind: 'short', actionId: 'animations/wave.webm', durationMs: 3_000 },
        { kind: 'long', actionId: '放风筝', durationMs: 40_000 },
        { kind: 'short', actionId: 'animations/tilt.webm', durationMs: 3_000 },
      ],
    }, 40_000)

    expect(result.sequence.steps).toHaveLength(1)
    expect(result.dropped).toHaveLength(2)
    expect(result.truncated).toBe(true)
    expect(result.totalMs).toBe(3_000)
  })

  it('returns an empty sequence for a zero budget', () => {
    const result = truncateSequenceToBudget({
      steps: [{ kind: 'short', actionId: 'animations/wave.webm' }],
    }, 0)
    expect(result.sequence.steps).toEqual([])
    expect(result.truncated).toBe(true)
  })

  it('runs steps in order and finishes', () => {
    const fake = createFakeClock()
    const steps: SequenceStep[] = [
      { kind: 'short', actionId: 'animations/wave.webm', durationMs: 1_000 },
      { kind: 'short', actionId: 'animations/tilt.webm', durationMs: 1_000 },
    ]
    const played: string[] = []
    let finished = 0
    const runner = new SequenceRunner({
      clock: fake.clock,
      onStep: step => played.push(step.actionId),
      onFinish: () => {
        finished += 1
      },
    })

    runner.start({ steps })
    expect(played).toEqual(['animations/wave.webm'])
    fake.advance(999)
    expect(played).toHaveLength(1)
    fake.advance(1)
    expect(played).toEqual(['animations/wave.webm', 'animations/tilt.webm'])
    fake.advance(1_000)
    expect(finished).toBe(1)
    expect(runner.running).toBe(false)
  })

  it('stops without finishing when interrupted', () => {
    const fake = createFakeClock()
    let finished = 0
    const runner = new SequenceRunner({
      clock: fake.clock,
      onFinish: () => {
        finished += 1
      },
    })

    runner.start({
      steps: [
        { kind: 'short', actionId: 'animations/wave.webm', durationMs: 1_000 },
        { kind: 'short', actionId: 'animations/tilt.webm', durationMs: 1_000 },
      ],
    })
    runner.interrupt()
    fake.advance(10_000)

    expect(finished).toBe(0)
    expect(runner.running).toBe(false)
    expect(fake.pending()).toBe(0)
  })

  it('finishes an empty sequence at once', () => {
    const fake = createFakeClock()
    let finished = 0
    const runner = new SequenceRunner({
      clock: fake.clock,
      onFinish: () => {
        finished += 1
      },
    })

    runner.start({ steps: [] })
    expect(finished).toBe(1)
    expect(runner.running).toBe(false)
  })
})
