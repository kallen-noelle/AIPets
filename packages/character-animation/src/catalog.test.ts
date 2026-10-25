import { describe, expect, it } from 'vitest'

import { createCatalogIndex, parseCharacterCatalog } from './catalog'

const catalogInput = {
  catalogVersion: 1,
  packId: 'main',
  generatedAt: '2026-10-25T00:00:00.000Z',
  clips: [
    {
      id: 'animations/点击回应-害羞惊讶.webm',
      name: '点击回应-害羞惊讶',
      description: '被夸奖后低头缩肩',
      tags: ['shy', 'happy'],
      valence: 0.45,
      arousal: 0.55,
      role: 'oneShot',
      source: 'manual',
    },
    {
      id: 'animations/原地小憩沉眠.webm',
      name: '原地小憩沉眠',
      description: '缩成一团睡觉',
      tags: ['sleepy', 'loop'],
      valence: 0.1,
      arousal: 0.1,
      role: 'loop',
      source: 'inferred',
    },
  ],
}

describe('characterCatalog', () => {
  it('parses a valid catalog and indexes clips by tag', () => {
    const result = parseCharacterCatalog(catalogInput)
    expect(result.ok).toBe(true)
    if (!result.ok)
      return

    const index = createCatalogIndex(result.catalog)
    expect(index.byId.get('animations/原地小憩沉眠.webm')?.name).toBe('原地小憩沉眠')
    expect(index.byTag.get('shy')?.map(clip => clip.id)).toEqual(['animations/点击回应-害羞惊讶.webm'])
  })

  it('rejects duplicate clip ids', () => {
    const result = parseCharacterCatalog({
      ...catalogInput,
      clips: [catalogInput.clips[0], catalogInput.clips[0]],
    })

    expect(result.ok).toBe(false)
    if (result.ok)
      return
    expect(result.issues).toContain('duplicate clip id: animations/点击回应-害羞惊讶.webm')
  })

  it('rejects a clip with an out-of-range valence', () => {
    const result = parseCharacterCatalog({
      ...catalogInput,
      clips: [{ ...catalogInput.clips[0], valence: 1.4 }],
    })

    expect(result.ok).toBe(false)
  })
})
