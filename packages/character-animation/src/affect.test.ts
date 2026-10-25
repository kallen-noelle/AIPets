import { describe, expect, it } from 'vitest'

import {
  applyAffectDelta,
  applyAffectEvent,
  createAffectState,
  decayAffect,
  defaultCharacterTraits,
  parseAffectState,
} from './affect'

const baseline = { valence: 0.2, arousal: 0.45 }
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
    expect(state.valence).toBe(0.2)
    expect(state.arousal).toBe(0.45)
    expect(state.label).toBe('shy')
    expect(state.affinity).toBe(0)
  })

  it('applies praise as a bounded affect and affinity change', () => {
    const state = applyAffectEvent(createState(), 'praise', shyTraits, { now: 1000 })

    expect(state.valence).toBeCloseTo(0.308, 5)
    expect(state.arousal).toBeCloseTo(0.495, 5)
    expect(state.label).toBe('shy')
    expect(state.affinity).toBe(2)
  })

  it('becomes excited after three quick praises', () => {
    const first = applyAffectEvent(createState(), 'praise', shyTraits, { now: 1000 })
    const second = applyAffectEvent(first, 'praise', shyTraits, { now: 2000 })
    const third = applyAffectEvent(second, 'praise', shyTraits, { now: 3000 })

    expect(third.label).toBe('excited')
  })

  it('makes main sad and character2 angry after one insult', () => {
    const main = applyAffectEvent(createState(), 'insult', shyTraits, { now: 1000 })
    expect(main.valence).toBeCloseTo(-0.115, 5)
    expect(main.arousal).toBeCloseTo(0.504, 5)
    expect(main.label).toBe('sad')

    const character2 = applyAffectEvent(createAffectState({
      characterId: 'character2',
      baseline: { valence: 0.1, arousal: 0.5 },
      traits: { ...defaultCharacterTraits, shyness: 0.25, pride: 0.9 },
      now: 0,
    }), 'insult', { ...defaultCharacterTraits, shyness: 0.25, pride: 0.9 }, { now: 1000 })

    expect(character2.valence).toBeCloseTo(-0.2325, 5)
    expect(character2.arousal).toBeCloseTo(0.56, 5)
    expect(character2.label).toBe('angry')
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

    expect(decayed.valence).toBeCloseTo(0.5, 5)
    expect(decayed.arousal).toBeCloseTo(0.49375, 5)
    expect(decayed.updatedAt).toBe(60 * 60 * 1000)
  })

  it('keeps an adjacent label during the minimum dwell time', () => {
    const state = {
      ...createState(0),
      valence: 0.5,
      arousal: 0.6,
      label: 'content' as const,
      updatedAt: 1000,
      labelChangedAt: 1000,
    }

    const next = applyAffectDelta(state, { valence: 0, arousal: 0 }, shyTraits, { now: 2000 })
    expect(next.label).toBe('content')
  })

  it('rejects persisted state with a non-finite value', () => {
    const result = parseAffectState({
      ...createState(0),
      valence: Number.NaN,
    })

    expect(result.ok).toBe(false)
  })
})
