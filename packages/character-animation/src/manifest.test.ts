import type { RawClipEntry } from './schema'

import { describe, expect, it } from 'vitest'

import { parseAnimationManifest } from './manifest'

function createManifest(overrides: Record<string, unknown> = {}) {
  return {
    manifestVersion: 1,
    id: 'test-pet',
    name: 'Test Pet',
    canvas: { width: 1280, height: 720 },
    animations: {
      idle: [{ src: 'idle/a.webm', weight: 2 }, 'idle/b.webm'],
      ...overrides,
    },
  }
}

describe('parseAnimationManifest', () => {
  it('normalizes clips and falls back to idle for missing chains', () => {
    const result = parseAnimationManifest(createManifest())
    expect(result.ok).toBe(true)
    if (!result.ok)
      return

    expect(result.pack.chains.idle.map(clip => clip.id)).toEqual(['idle/a.webm', 'idle/b.webm'])
    expect(result.pack.chains.talk.map(clip => clip.id)).toEqual(['idle/a.webm', 'idle/b.webm'])
    expect(result.pack.chains.thinking.map(clip => clip.id)).toEqual(['idle/a.webm', 'idle/b.webm'])
    expect(result.pack.allClips).toHaveLength(2)
  })

  it('normalizes emotion tiers and actions', () => {
    const result = parseAnimationManifest(createManifest({
      emotion: {
        happy: {
          low: ['emotion/happy-low.webm'],
          high: ['emotion/happy-high.webm'],
        },
      },
      actions: { wave: 'action/wave.webm' },
    }))
    expect(result.ok).toBe(true)
    if (!result.ok)
      return

    expect(result.pack.emotions.happy.high[0]?.id).toBe('emotion/happy-high.webm')
    expect(result.pack.actions.wave?.[0]?.id).toBe('action/wave.webm')
  })

  it('rejects manifests without idle clips', () => {
    const manifest = createManifest({ idle: [] })
    const result = parseAnimationManifest(manifest)
    expect(result.ok).toBe(false)
  })

  it('rejects unsafe paths', () => {
    const result = parseAnimationManifest(createManifest({
      idle: ['../outside.webm'],
    }))
    expect(result.ok).toBe(false)
    if (result.ok)
      return
    expect(result.issues.some(issue => issue.includes('must not contain'))).toBe(true)
  })

  it('rejects unsupported extensions', () => {
    const result = parseAnimationManifest(createManifest({
      idle: ['idle/a.gif'],
    }))
    expect(result.ok).toBe(false)
  })

  it('accepts a single clip object entry', () => {
    const entry: RawClipEntry = { src: 'idle/a.webm', weight: 3, loop: true }
    const result = parseAnimationManifest(createManifest({ idle: [entry] }))
    expect(result.ok).toBe(true)
    if (!result.ok)
      return
    expect(result.pack.chains.idle[0]?.weight).toBe(3)
  })

  it('normalizes long actions and requires a mid duration', () => {
    const result = parseAnimationManifest(createManifest({
      longActions: {
        swing: {
          start: 'long/swing-start.webm',
          mid: { src: 'long/swing-mid.webm', durationMs: 4000 },
          end: 'long/swing-end.webm',
        },
      },
    }))
    expect(result.ok).toBe(true)
    if (!result.ok)
      return

    expect(result.pack.longActions.swing?.mid.durationMs).toBe(4000)
    expect(result.pack.longActions.swing?.mid.loop).toBe(false)
    expect(result.pack.longActions.swing?.start?.id).toBe('long/swing-start.webm')
    expect(result.pack.allClips.map(clip => clip.id)).toContain('long/swing-mid.webm')
  })

  it('rejects a long action without any duration source', () => {
    const result = parseAnimationManifest(createManifest({
      longActions: {
        swing: { mid: 'long/swing-mid.webm' },
      },
    }))
    expect(result.ok).toBe(false)
    if (result.ok)
      return
    expect(result.issues.some(issue => issue.includes('needs durationMs or defaultDurationMs'))).toBe(true)
  })

  it('accepts a long action with only a default duration', () => {
    const result = parseAnimationManifest(createManifest({
      longActions: {
        swing: { mid: 'long/swing-mid.webm', defaultDurationMs: 8000 },
      },
    }))
    expect(result.ok).toBe(true)
  })
})
