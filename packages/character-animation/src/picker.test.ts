import type { NormalizedClip } from './types'

import { describe, expect, it } from 'vitest'

import { WeightedPicker } from './picker'

function clip(id: string, weight = 1): NormalizedClip {
  return { id, src: id, weight, loop: true }
}

describe('weightedPicker', () => {
  it('picks the first clip when the random source is zero', () => {
    const picker = new WeightedPicker(() => 0)
    expect(picker.pick([clip('a'), clip('b')])?.id).toBe('a')
  })

  it('avoids the previous clip when another candidate exists', () => {
    const picker = new WeightedPicker(() => 0)
    expect(picker.pick([clip('a'), clip('b')], 'a')?.id).toBe('b')
  })

  it('keeps the only clip even when it was the previous one', () => {
    const picker = new WeightedPicker(() => 0)
    expect(picker.pick([clip('a')], 'a')?.id).toBe('a')
  })

  it('falls back to uniform selection when all weights are zero', () => {
    const picker = new WeightedPicker(() => 0.99)
    expect(picker.pick([clip('a', 0), clip('b', 0)])?.id).toBe('b')
  })

  it('returns undefined for an empty list', () => {
    const picker = new WeightedPicker()
    expect(picker.pick([])).toBeUndefined()
  })
})
