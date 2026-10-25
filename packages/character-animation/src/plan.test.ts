import type { CharacterCatalog } from './catalog'

import { describe, expect, it } from 'vitest'

import { validatePerformancePlan } from './plan'

function createCatalog(): CharacterCatalog {
  return {
    catalogVersion: 1,
    packId: 'main',
    generatedAt: '2026-10-25T00:00:00.000Z',
    clips: [
      {
        id: 'a.webm',
        name: '开心',
        description: '开心地跳一下',
        tags: ['happy'],
        valence: 0.8,
        arousal: 0.8,
        role: 'oneShot',
        source: 'manual',
      },
      {
        id: 'b.webm',
        name: '打哈欠',
        description: '困倦地打哈欠',
        tags: ['sleepy'],
        valence: 0,
        arousal: 0.1,
        role: 'oneShot',
        source: 'manual',
      },
      {
        id: 'c.webm',
        name: '难过',
        description: '低头难过',
        tags: ['sad'],
        valence: -0.6,
        arousal: 0.2,
        role: 'oneShot',
        source: 'manual',
      },
    ],
  }
}

describe('performancePlan', () => {
  it('clamps affect and sorts cues by anchor', () => {
    const result = validatePerformancePlan({
      affect: { valence: 0.5, arousal: -0.4 },
      cues: [
        { anchor: { type: 'afterSpeech' }, clipId: 'a.webm' },
        { anchor: { type: 'replyStart' }, clipId: 'b.webm' },
        { anchor: { type: 'sentence', index: 1 }, clipId: 'c.webm' },
      ],
    }, { catalog: createCatalog() })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.plan)
      return

    expect(result.plan.affect).toEqual({ valence: 0.1, arousal: -0.08 })
    expect(result.plan.cues.map(cue => cue.clipId)).toEqual(['b.webm', 'c.webm', 'a.webm'])
  })

  it('drops unknown and duplicate clips without failing the plan', () => {
    const result = validatePerformancePlan({
      cues: [
        { anchor: { type: 'replyStart' }, clipId: 'missing.webm' },
        { anchor: { type: 'replyStart' }, clipId: 'a.webm' },
        { anchor: { type: 'sentence', index: 1 }, clipId: 'a.webm' },
      ],
    }, { catalog: createCatalog() })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.plan)
      return

    expect(result.plan.cues).toHaveLength(1)
    expect(result.plan.cues[0]?.clipId).toBe('a.webm')
    expect(result.issues).toContain('cue dropped: unknown clip missing.webm')
    expect(result.issues).toContain('cue dropped: duplicate clip a.webm')
  })

  it('enforces the cue limit', () => {
    const result = validatePerformancePlan({
      cues: [
        { anchor: { type: 'replyStart' }, clipId: 'a.webm' },
        { anchor: { type: 'sentence', index: 1 }, clipId: 'b.webm' },
        { anchor: { type: 'afterSpeech' }, clipId: 'c.webm' },
      ],
    }, { catalog: createCatalog(), maxCues: 2 })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.plan)
      return

    expect(result.plan.cues).toHaveLength(2)
    expect(result.issues).toContain('cue dropped: c.webm exceeds the 2 cue limit')
  })

  it('drops cues with forbidden tags', () => {
    const result = validatePerformancePlan({
      cues: [{ anchor: { type: 'replyStart' }, clipId: 'b.webm' }],
    }, { catalog: createCatalog(), forbiddenTags: ['sleepy'] })

    expect(result.ok).toBe(true)
    if (!result.ok || !result.plan)
      return

    expect(result.plan.cues).toHaveLength(0)
    expect(result.issues).toContain('cue dropped: b.webm uses a forbidden tag')
  })

  it('rejects an invalid anchor', () => {
    const result = validatePerformancePlan({
      cues: [{ anchor: { type: 'sentence', index: 0 }, clipId: 'a.webm' }],
    }, { catalog: createCatalog() })

    expect(result.ok).toBe(false)
    expect(result.plan).toBeNull()
  })
})
