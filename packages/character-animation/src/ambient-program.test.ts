import { describe, expect, it } from 'vitest'

import {
  ambientPhaseSteps,
  ambientProgramDurationMs,
  parseAmbientProgram,
  resolveAmbientPhase,
} from './ambient-program'

const hour = 3_600_000
const anchorAt = '2026-10-27T08:00:00+08:00'
const anchorMs = Date.parse(anchorAt)

function createProgram(overrides: Record<string, unknown> = {}) {
  return {
    programVersion: 1,
    programId: 'program-1',
    characterId: 'main',
    anchorAt,
    phases: [
      { durationMs: 4 * hour, clips: ['animations/晨间刷牙.webm'], holdLongAction: '悠闲哼歌' },
      { durationMs: 5 * hour, clips: [], holdLongAction: '放风筝' },
      { durationMs: 7 * hour, clips: [], holdLongAction: '鲸鱼吐泡泡特效' },
      { durationMs: 8 * hour, clips: [], holdLongAction: '碎碎念-发呆碎碎念' },
    ],
    ...overrides,
  }
}

describe('parseAmbientProgram', () => {
  it('accepts a duration based program and sums one cycle', () => {
    const result = parseAmbientProgram(createProgram())
    expect(result.ok).toBe(true)
    if (!result.ok)
      return

    expect(result.program.phases).toHaveLength(4)
    expect(ambientProgramDurationMs(result.program)).toBe(24 * hour)
  })

  it('rejects an empty phase list', () => {
    const result = parseAmbientProgram(createProgram({ phases: [] }))
    expect(result.ok).toBe(false)
  })

  it('rejects a zero or fractional duration', () => {
    expect(parseAmbientProgram(createProgram({
      phases: [{ durationMs: 0 }],
    })).ok).toBe(false)
    expect(parseAmbientProgram(createProgram({
      phases: [{ durationMs: 1500.5 }],
    })).ok).toBe(false)
  })

  it('rejects a program longer than seven days', () => {
    const result = parseAmbientProgram(createProgram({
      phases: [{ durationMs: 8 * 24 * hour }],
    }))
    expect(result.ok).toBe(false)
  })
})

describe('resolveAmbientPhase', () => {
  const program = (() => {
    const result = parseAmbientProgram(createProgram())
    if (!result.ok)
      throw new Error(result.issues.join(', '))
    return result.program
  })()

  it('starts on the first phase and reports its remaining time', () => {
    const state = resolveAmbientPhase(program, anchorMs)
    expect(state?.index).toBe(0)
    expect(state?.cycle).toBe(0)
    expect(state?.atStart).toBe(true)
    expect(state?.remainingMs).toBe(4 * hour)
  })

  it('keeps the phase until its nominal end', () => {
    const state = resolveAmbientPhase(program, anchorMs + 2 * hour)
    expect(state?.index).toBe(0)
    expect(state?.atStart).toBe(false)
    expect(state?.remainingMs).toBe(2 * hour)
  })

  it('moves to the next phase at the boundary', () => {
    const state = resolveAmbientPhase(program, anchorMs + 4 * hour)
    expect(state?.index).toBe(1)
    expect(state?.atStart).toBe(true)
    expect(state?.remainingMs).toBe(5 * hour)
  })

  it('wraps to the next cycle after one full program', () => {
    const state = resolveAmbientPhase(program, anchorMs + 25 * hour)
    expect(state?.cycle).toBe(1)
    expect(state?.index).toBe(0)
    expect(state?.remainingMs).toBe(3 * hour)
  })

  it('treats a time before the anchor as the program start', () => {
    const state = resolveAmbientPhase(program, anchorMs - hour)
    expect(state?.index).toBe(0)
    expect(state?.atStart).toBe(true)
  })

  it('marks a late timer as not at the phase start', () => {
    const state = resolveAmbientPhase(program, anchorMs + 4 * hour + 61_000)
    expect(state?.index).toBe(1)
    expect(state?.atStart).toBe(false)
  })
})

describe('ambientPhaseSteps', () => {
  it('plays the entry clips first and holds the long action last', () => {
    const steps = ambientPhaseSteps({
      durationMs: hour,
      clips: ['a', 'b'],
      holdLongAction: '放风筝',
    })
    expect(steps).toEqual([
      { kind: 'clip', clipId: 'a' },
      { kind: 'clip', clipId: 'b' },
      { kind: 'hold', longAction: '放风筝' },
    ])
  })

  it('returns no step for a phase without clips and without a hold', () => {
    expect(ambientPhaseSteps({ durationMs: hour, clips: [] })).toEqual([])
  })
})
