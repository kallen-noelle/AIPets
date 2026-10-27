import type { PlanTimelineMark } from './arrival'
import type { PerformanceCue } from './plan'

import { describe, expect, it } from 'vitest'

import { resolvePlanArrival } from './arrival'

function cue(anchor: PerformanceCue['anchor'], clipId: string, durationSeconds?: number): PerformanceCue {
  return { anchor, clipId, intensity: 0.7, ...(durationSeconds ? { durationSeconds } : {}) }
}

const marks: PlanTimelineMark[] = [
  { type: 'reply-start', at: 0 },
  { type: 'sentence', index: 1, at: 1_000 },
  { type: 'sentence', index: 2, at: 3_000 },
  { type: 'speech-end', at: 5_000 },
]

describe('planArrival', () => {
  it('plays a cue that is at most two seconds late', () => {
    const decision = resolvePlanArrival({
      cues: [cue({ type: 'sentence', index: 2 }, 'wave')],
      marks,
      now: 4_500,
    })

    expect(decision.playNow.map(item => item.clipId)).toEqual(['wave'])
    expect(decision.dropped).toEqual([])
  })

  it('drops a single anchor that is over two seconds late', () => {
    const decision = resolvePlanArrival({
      cues: [cue({ type: 'replyStart' }, 'wave')],
      marks,
      now: 7_000,
    })

    expect(decision.playNow).toEqual([])
    expect(decision.dropped).toEqual([{ clipId: 'wave', reason: 'late-anchor' }])
  })

  it('keeps only the newest of several late anchors', () => {
    const decision = resolvePlanArrival({
      cues: [
        cue({ type: 'replyStart' }, 'old'),
        cue({ type: 'sentence', index: 1 }, 'newer'),
        cue({ type: 'sentence', index: 2 }, 'newest'),
      ],
      marks,
      now: 9_000,
    })

    expect(decision.playNow.map(item => item.clipId)).toEqual(['newest'])
    expect(decision.dropped).toEqual([
      { clipId: 'old', reason: 'superseded-late' },
      { clipId: 'newer', reason: 'superseded-late' },
    ])
  })

  it('never drops afterSpeech cues', () => {
    const decision = resolvePlanArrival({
      cues: [cue({ type: 'afterSpeech' }, 'wave')],
      marks,
      now: 30_000,
    })

    expect(decision.playNow.map(item => item.clipId)).toEqual(['wave'])
  })

  it('schedules anchors that are still in the future', () => {
    const decision = resolvePlanArrival({
      cues: [cue({ type: 'sentence', index: 2 }, 'wave')],
      marks: [{ type: 'reply-start', at: 0 }],
      now: 500,
    })

    expect(decision.scheduled.map(item => item.clipId)).toEqual(['wave'])
    expect(decision.playNow).toEqual([])
  })

  it('drops a sentence insert that is longer than two seconds', () => {
    const decision = resolvePlanArrival({
      cues: [cue({ type: 'sentence', index: 2 }, 'long-clip')],
      marks,
      now: 3_500,
      clipDurations: { 'long-clip': 3_500 },
    })

    expect(decision.dropped).toEqual([{ clipId: 'long-clip', reason: 'too-long' }])
  })

  it('forbids long actions during speech', () => {
    const decision = resolvePlanArrival({
      cues: [cue({ type: 'sentence', index: 2 }, '放风筝', 20)],
      marks,
      now: 3_500,
    })

    expect(decision.dropped).toEqual([{ clipId: '放风筝', reason: 'long-action-in-speech' }])
  })

  it('plays a past silence now and times a future one', () => {
    const past = resolvePlanArrival({
      cues: [cue({ type: 'silence', seconds: 2 }, 'a')],
      marks,
      now: 8_000,
    })
    expect(past.playNow.map(item => item.clipId)).toEqual(['a'])

    const future = resolvePlanArrival({
      cues: [cue({ type: 'silence', seconds: 4 }, 'b')],
      marks,
      now: 8_000,
    })
    expect(future.timed).toEqual([{ cue: cue({ type: 'silence', seconds: 4 }, 'b'), inMs: 1_000 }])
    expect(future.playNow).toEqual([])
  })

  it('orders playNow cues by anchor', () => {
    const decision = resolvePlanArrival({
      cues: [
        cue({ type: 'afterSpeech' }, 'after'),
        cue({ type: 'replyStart' }, 'start'),
      ],
      marks,
      now: 1_500,
    })

    expect(decision.playNow.map(item => item.clipId)).toEqual(['start', 'after'])
  })
})
