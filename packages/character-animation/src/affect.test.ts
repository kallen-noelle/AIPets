import { describe, expect, it } from 'vitest'

import {
  applyAffectDelta,
  applyAffectEvent,
  createAffectState,
  decayAffect,
  defaultCharacterTraits,
  parseAffectState,
} from './affect'

const baseline = { valence: 0.1, arousal: 0.4 }
const shyTraits = { ...defaultCharacterTraits, shyness: 0.8 }

function createState(now = 0) {
  return createAffectState({
    characterId: 'main',
    baseline,
    traits: shyTraits,
    now,
  })
}

describe('affect', () => {
  it('starts at the persona baseline', () => {
    const state = createState()
    expect(state.valence).toBe(0.1)
    expect(state.arousal).toBe(0.4)
    expect(state.label).toBe('calm')
    expect(state.affinity).toBe(0)
  })

  it('applies praise as a bounded affect and affinity change', () => {
    const state = applyAffectEvent(createState(), 'praise', shyTraits, { now: 1000 })

    expect(state.valence).toBeCloseTo(0.208, 5)
    expect(state.arousal).toBeCloseTo(0.424, 5)
    expect(state.label).toBe('shy')
    expect(state.affinity).toBe(2)
  })

  it('reaches sad after repeated insults', () => {
    const first = applyAffectEvent(createState(), 'insult', shyTraits, { now: 1000 })
    expect(first.valence).toBeCloseTo(-0.08, 5)
    expect(first.label).toBe('calm')

    const second = applyAffectEvent(first, 'insult', shyTraits, { now: 2000 })
    expect(second.valence).toBeCloseTo(-0.264, 5)
    expect(second.label).toBe('sad')
  })

  it('decays toward the baseline with a half-life', () => {
    const state = {
      ...createState(0),
      valence: 0.8,
      arousal: 0.8,
      label: 'excited' as const,
      updatedAt: 0,
    }

    const decayed = decayAffect(state, {
      now: 60 * 60 * 1000,
      baseline,
      traits: shyTraits,
    })

    expect(decayed.valence).toBeCloseTo(0.45, 5)
    expect(decayed.arousal).toBeCloseTo(0.45, 5)
    expect(decayed.updatedAt).toBe(60 * 60 * 1000)
  })

  it('keeps the current label during the minimum dwell time', () => {
    const state = {
      ...createState(0),
      valence: 0.5,
      arousal: 0.7,
      label: 'shy' as const,
      updatedAt: 1000,
      labelChangedAt: 1000,
    }

    const next = applyAffectDelta(state, { valence: 0, arousal: 0 }, shyTraits, { now: 2000 })
    expect(next.label).toBe('shy')
  })

  it('rejects persisted state with a non-finite value', () => {
    const result = parseAffectState({
      ...createState(0),
      valence: Number.NaN,
    })

    expect(result.ok).toBe(false)
  })
})
