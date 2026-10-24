import type { NormalizedClip } from './types'

export type RandomSource = () => number

export class WeightedPicker {
  private readonly random: RandomSource

  constructor(random: RandomSource = Math.random) {
    this.random = random
  }

  pick(clips: NormalizedClip[], lastId?: string): NormalizedClip | undefined {
    if (!clips.length)
      return undefined

    const filtered = clips.length > 1 && lastId
      ? clips.filter(clip => clip.id !== lastId)
      : clips
    const pool = filtered.length ? filtered : clips

    const total = pool.reduce((sum, clip) => sum + Math.max(0, clip.weight), 0)
    if (total <= 0)
      return pool[Math.floor(this.random() * pool.length) % pool.length]

    let ticket = this.random() * total
    for (const clip of pool) {
      ticket -= Math.max(0, clip.weight)
      if (ticket <= 0)
        return clip
    }

    return pool[pool.length - 1]
  }
}
